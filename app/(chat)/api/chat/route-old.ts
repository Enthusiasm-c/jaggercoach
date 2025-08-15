import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
  generateText,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import type { ChatModel } from '@/lib/ai/models';
import type { VisibilityType } from '@/components/visibility-selector';
import { TrainerState, createInitialState, appendUnique, updateObjectives, isScenarioComplete } from '@/lib/trainer-state';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { openai } from '@ai-sdk/openai';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

// Load training scenarios
const scenariosPath = path.join(process.cwd(), 'scenarios', 'jaeger_high5.yaml');
const scenariosContent = fs.readFileSync(scenariosPath, 'utf8');
const scenariosData = yaml.load(scenariosContent) as any;

// Store training states per chat
const trainingStates = new Map<string, TrainerState>();

function isGreeting(message: string): boolean {
  const greetings = [
    'привет', 'здравствуй', 'добрый день', 'добрый вечер', 'доброе утро',
    'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
    'здарова', 'приветствую', 'салют', 'хай'
  ];
  const normalized = message.toLowerCase().trim();
  return greetings.some(greeting => normalized.includes(greeting));
}

function getRandomScenario() {
  const scenarios = scenariosData.scenarios;
  return scenarios[Math.floor(Math.random() * scenarios.length)];
}

function getScenario(scenarioId: string) {
  return scenariosData.scenarios.find((s: any) => s.id === scenarioId);
}

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel['id'];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

    // Check if this is a greeting to start training
    let trainingState = trainingStates.get(id);
    let isTrainingMode = false;
    let scenarioIntro = '';
    
    if (!trainingState && message.role === 'user' && message.parts[0]?.type === 'text') {
      const userText = message.parts[0].text;
      if (isGreeting(userText)) {
        // Initialize random training scenario
        const scenario = getRandomScenario();
        trainingState = createInitialState(scenario.id, scenario.must_cover_high5);
        trainingStates.set(id, trainingState);
        isTrainingMode = true;
        
        // Generate scenario introduction
        scenarioIntro = `Отлично! Давайте начнем тренировку.\n\nСценарий: "${scenario.title}"\n${scenario.intro}\n\nЯ - ${scenario.persona}. Чем могу помочь?`;
      }
    } else if (trainingState) {
      isTrainingMode = true;
    }

    if (!chat) {
      const title = isTrainingMode 
        ? `Тренировка: ${getScenario(trainingState!.scenarioId)?.title || 'High 5'}`
        : await generateTitleFromUserMessage({ message });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        if (isTrainingMode && trainingState) {
          // Training mode: Use judge and agent system
          const userText = message.parts.find(p => p.type === 'text')?.text || '';
          
          // If this is the first message (greeting), just return the scenario intro
          if (trainingState.turn === 0 && isGreeting(userText)) {
            dataStream.write({
              type: 'data-appendMessage',
              data: JSON.stringify({
                id: generateUUID(),
                role: 'assistant',
                parts: [{ type: 'text', text: scenarioIntro }],
              }),
            });
            trainingState.turn = 1;
            trainingStates.set(id, trainingState);
            return;
          }
          
          // Get scenario
          const scenario = getScenario(trainingState.scenarioId);
          if (!scenario) {
            throw new Error('Scenario not found');
          }
          
          // 1. Evaluate BA's message with Judge
          const judgeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/judge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenarioId: trainingState.scenarioId,
              state: trainingState,
              lastBA: userText
            })
          });
          
          const evaluation = await judgeResponse.json();
          
          // Update state based on evaluation
          if (evaluation.closed_high5_delta?.length > 0) {
            evaluation.closed_high5_delta.forEach((h5: string) => {
              trainingState.coveredHigh5 = appendUnique(trainingState.coveredHigh5, h5);
            });
          }
          
          if (evaluation.objective_delta) {
            trainingState.objectives = updateObjectives(trainingState.objectives, evaluation.objective_delta);
          }
          
          // Send evaluation feedback to client
          dataStream.write({
            type: 'data-custom',
            data: {
              type: 'evaluation',
              data: evaluation
            }
          });
          
          // 2. Get agent response
          const agentResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/agent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenarioId: trainingState.scenarioId,
              state: trainingState,
              lastTurn: userText
            })
          });
          
          const agentData = await agentResponse.json();
          
          // Update objections if new one was raised
          if (agentData.suggestedObjectionId && !trainingState.objectionsRaised.includes(agentData.suggestedObjectionId)) {
            trainingState.objectionsRaised = appendUnique(trainingState.objectionsRaised, agentData.suggestedObjectionId);
          }
          
          // Check if scenario is complete
          trainingState.done = isScenarioComplete(trainingState);
          trainingState.turn += 1;
          
          // Update stored state
          trainingStates.set(id, trainingState);
          
          // Send training state update
          dataStream.write({
            type: 'data-custom',
            data: {
              type: 'trainingState',
              data: trainingState
            }
          });
          
          // Send agent's response
          dataStream.write({
            type: 'data-appendMessage',
            data: JSON.stringify({
              id: generateUUID(),
              role: 'assistant',
              parts: [{ type: 'text', text: agentData.reply }],
            }),
          });
          
          if (trainingState.done) {
            dataStream.write({
              type: 'data-custom',
              data: {
                type: 'trainingComplete',
                data: { message: 'Сценарий успешно завершен!' }
              }
            });
          }
        } else {
          // Regular chat mode
          const result = streamText({
            model: myProvider.languageModel(selectedChatModel),
            system: systemPrompt({ selectedChatModel, requestHints }),
            messages: convertToModelMessages(uiMessages),
            stopWhen: stepCountIs(5),
            experimental_activeTools:
              selectedChatModel === 'chat-model-reasoning'
                ? []
                : [
                    'getWeather',
                    'createDocument',
                    'updateDocument',
                    'requestSuggestions',
                  ],
            experimental_transform: smoothStream({ chunking: 'word' }),
            tools: {
              getWeather,
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({
                session,
                dataStream,
              }),
            },
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: 'stream-text',
            },
          });

          result.consumeStream();

          dataStream.merge(
            result.toUIMessageStream({
              sendReasoning: true,
            }),
          );
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: message.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        });
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () =>
          stream.pipeThrough(new JsonToSseTransformStream()),
        ),
      );
    } else {
      return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
