import {
  createUIMessageStream,
  JsonToSseTransformStream,
} from 'ai';
import { type RequestHints } from '@/lib/ai/prompts';
import { generateUUID } from '@/lib/utils';
import { Memory, initialMemory } from '@/lib/memory-system';
import { agentPipeline } from '@/lib/agent-pipeline';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { openai } from '@ai-sdk/openai';
import type { ChatMessage } from '@/lib/types';
import type { VisibilityType } from '@/components/visibility-selector';

export const maxDuration = 60;

// Load training scenarios
const scenariosPath = path.join(process.cwd(), 'scenarios', 'jaeger_high5.yaml');
const scenariosContent = fs.readFileSync(scenariosPath, 'utf8');
const scenariosData = yaml.load(scenariosContent) as any;

// Store training states per chat
const trainingStates = new Map<string, Memory>();

function isGreeting(message: string): boolean {
  const greetings = [
    'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
    'greetings', 'howdy', 'welcome', 'yo', 'hola', 'bonjour'
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

export async function POST(request: Request) {
  try {
    const { id, message, trainingState: clientState, scenarioType }: {
      id: string; 
      message: ChatMessage; 
      trainingState?: Memory;
      scenarioType?: string;
    } = await request.json();

    // Use client state if provided, otherwise check memory (for backwards compatibility)
    let trainingState = clientState || trainingStates.get(id);
    let isTrainingMode = false;
    let scenarioIntro = '';
    
    console.log('Incoming request:', {
      hasClientState: !!clientState,
      trainingStateTurn: trainingState?.history.turn,
      messageText: message.parts[0]?.type === 'text' ? message.parts[0].text : undefined,
      scenarioType
    });
    
    if (!trainingState && message.role === 'user' && message.parts[0]?.type === 'text') {
      const userText = message.parts[0].text;
      if (isGreeting(userText)) {
        // Initialize training scenario (use selected type or random)
        const scenario = scenarioType && scenarioType !== 'random' 
          ? getScenario(scenarioType) 
          : getRandomScenario();
        trainingState = initialMemory(scenario);
        trainingStates.set(id, trainingState);
        isTrainingMode = true;
        
        // Generate detailed scenario introduction
        const getBarName = () => {
          switch(scenario.id) {
            case 'product_absent':
              return 'The Velvet Room';
            case 'no_promo':
              return 'Murphy\'s Pub';
            case 'no_perfect_serve':
              return 'Wave House';
            default:
              return 'the venue';
          }
        };
        
        const getManagerName = () => {
          switch(scenario.id) {
            case 'product_absent':
              return 'Sarah';
            case 'no_promo':
              return 'Tom';
            case 'no_perfect_serve':
              return 'Mark';
            default:
              return 'the manager';
          }
        };
        
        const barName = getBarName();
        const managerName = getManagerName();
        
        // Build situation description based on scenario
        let situationDesc = '';
        let initialResponse = '';
        let taskDesc = '';
        
        if (scenario.id === 'product_absent') {
          situationDesc = `You walk into "${barName}" — a small cocktail bar with minimalist style.
They don't carry Jägermeister. The focus is on signature shots and cocktails.

The bar owner — ${managerName} — greets you. You exchange pleasantries.
When you mention Jägermeister, she responds:`;
          
          initialResponse = `Look, nobody really asks for Jäger here. We've got our own signature shots that move just fine. What's so special about yours?`;
          
          taskDesc = `Your task: Convince ${managerName} to try Jägermeister with a low-risk trial offer and appropriate support.`;
        } else if (scenario.id === 'no_promo') {
          situationDesc = `You walk into "${barName}" — a popular pub with 120 seats.
Jägermeister is on the shelf but not actively promoted.

The bar manager — ${managerName} — greets you. You exchange pleasantries.
You notice Jäger is available but there's no visibility or promotion. When you ask about it, he says:`;
          
          initialResponse = `Yeah, Jäger sells fine as is. But all that promotional stuff? Come on, we're not that kind of place. I don't want tacky posters everywhere.`;
          
          taskDesc = `Your task: Convince ${managerName} that tasteful, venue-appropriate promotions can boost sales without compromising the bar's style.`;
        } else if (scenario.id === 'no_perfect_serve') {
          situationDesc = `You walk into "${barName}" — a large beach club venue.
Jägermeister is on the menu, there's a Tap Machine at the bar, but it's turned off.

The bar manager — ${managerName} — greets you. You exchange pleasantries.
You notice they're pouring Jäger straight from the bottle at room temperature.

When you ask about it, he responds:`;
          
          initialResponse = `Yeah, we tried using it when we first got it. But honestly? The bartenders say it's slower, uses electricity, and the bottles sell fine from the shelf. Why complicate things?`;
          
          taskDesc = `Your task: Convince ${managerName} that ice-cold serve through the Tap isn't a "complication" — it's key to brand perception and sales growth.`;
        }
        
        scenarioIntro = `Okay, launching randomly selected scenario → Scenario: "${scenario.title}"

⸻

🟢 Situation:

${situationDesc}

— ${initialResponse}

⸻

🎯 ${taskDesc}

👉 What's your response?`;
        
        console.log('Training initialized:', { 
          scenarioId: scenario.id, 
          turn: trainingState.history.turn,
          scenarioIntro: scenarioIntro.substring(0, 100) + '...'
        });
      }
    } else if (trainingState) {
      isTrainingMode = true;
    }

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        console.log('Stream execute:', { isTrainingMode, hasTrainingState: !!trainingState, turn: trainingState?.history.turn });
        
        if (isTrainingMode && trainingState) {
          // Training mode: Use judge and agent system
          const userText = message.parts.find(p => p.type === 'text')?.text || '';
          console.log('Training mode active, user text:', userText, 'turn:', trainingState.history.turn);
          
          // If this is the first message (greeting), just return the scenario intro
          if (scenarioIntro && trainingState.history.turn === 0) {
            console.log('Returning scenario intro');
            dataStream.write({
              type: 'data-appendMessage',
              data: JSON.stringify({
                id: generateUUID(),
                role: 'assistant',
                parts: [{ type: 'text', text: scenarioIntro }],
              }),
            });
            trainingState.history.turn = 1;
            trainingStates.set(id, trainingState);
            
            // Send training state update to client
            dataStream.write({
              type: 'data-custom',
              data: {
                type: 'trainingState',
                data: trainingState
              }
            });
            return;
          }
          
          // Get scenario
          const scenario = getScenario(trainingState.scenarioId);
          if (!scenario) {
            throw new Error('Scenario not found');
          }
          
          // The new memory system handles state tracking automatically.
          // This includes conversation topics, objections, and commitments.
          // All the manual tracking logic below is now removed.

          // Check if the conversation is already concluded
          if (trainingState.fsm.state === 'CONCLUDED') {
            console.log('Conversation already complete, ending.');
            
            // Send completion message
            dataStream.write({
              type: 'data-appendMessage',
              data: JSON.stringify({
                id: generateUUID(),
                role: 'system',
                parts: [{ type: 'text', text: '✅ Deal closed! Type "Hello" to start a new scenario.' }],
              }),
            });
            return;
          }
          
          // Get agent response ONLY - no judge for speed
          console.log('Calling agent with state:', { 
            scenarioId: trainingState.scenarioId,
            turn: trainingState.history.turn,
            userText 
          });
          const agentStart = Date.now();
          
          // Call agent pipeline
          const agentResult = await agentPipeline(
            trainingState,
            userText,
          );

          // Update the memory state for the next turn
          trainingState = agentResult.newMemory;
          trainingStates.set(id, trainingState);

          // Create a temporary object for compatibility with the old code that expects agentData.reply
          const agentData = { reply: agentResult.reply, suggestedObjectionId: null };
          
          const agentTime = Date.now() - agentStart;
          console.log(`Agent response time: ${agentTime}ms`);
          
          // All state management, including objectives, objections, and completion status,
          // is now handled by the agent pipeline and the memory patch system.
          // The manual tracking logic has been removed.
          
          // The turn counter is now part of the memory object's history.
          // The Actor component is responsible for proposing an update to it.
          // We just need to make sure the new memory is stored.
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
          
          // Check if the FSM has reached the concluded state
          if (trainingState.fsm.state === 'CONCLUDED') {
            // Mark as complete
            trainingStates.set(id, trainingState);
            
            // Generate final evaluation summary from the new memory state
            const finalSummary = `
⸻

🎉 **Training Complete!**

**Scenario:** ${scenario.title}
**Result:** ✅ Successfully closed the deal!

**Performance Summary:**
• Turns taken: ${trainingState.history.turn}
• Objections handled: ${trainingState.objections.raised.length}
${trainingState.high5.covered.length > 0 ? `• High5 elements covered: ${trainingState.high5.covered.join(', ')}` : ''}

**Commitments Made:**
${trainingState.commitments.trial ? '✓ Trial order secured' : ''}
${trainingState.commitments.posm_accepted ? '✓ POSM material agreed' : ''}
${trainingState.commitments.training ? '✓ Staff training scheduled' : ''}

Type "Hello" to try another scenario!
`;
            
            dataStream.write({
              type: 'data-appendMessage',
              data: JSON.stringify({
                id: generateUUID(),
                role: 'system',
                parts: [{ type: 'text', text: finalSummary }],
              }),
            });
            
            // Clear the training state for this chat to allow new scenario
            trainingStates.delete(id);
          }
        } else {
          // For non-training messages, just echo back
          dataStream.write({
            type: 'data-appendMessage',
            data: JSON.stringify({
              id: generateUUID(),
              role: 'assistant',
              parts: [{ type: 'text', text: 'Please say "Hello" or "Hi" to start your Jägermeister High 5 training!' }],
            }),
          });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        console.log('Messages completed:', messages.length);
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(request: Request) {
  return new Response('OK', { status: 200 });
}