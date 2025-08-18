import {
  createUIMessageStream,
  JsonToSseTransformStream,
  generateText,
} from 'ai';
import { type RequestHints } from '@/lib/ai/prompts';
import { generateUUID } from '@/lib/utils';
import { TrainerState, createInitialState, appendUnique, updateObjectives, isScenarioComplete } from '@/lib/trainer-state';
import { getAgentResponse } from '@/lib/agent';
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
const trainingStates = new Map<string, TrainerState>();

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
    const { id, message, difficulty = 'medium', trainingState: clientState, scenarioType }: { 
      id: string; 
      message: ChatMessage; 
      difficulty?: string;
      trainingState?: TrainerState;
      scenarioType?: string;
    } = await request.json();

    // Use client state if provided, otherwise check memory (for backwards compatibility)
    let trainingState = clientState || trainingStates.get(id);
    let isTrainingMode = false;
    let scenarioIntro = '';
    
    console.log('Incoming request:', {
      hasClientState: !!clientState,
      trainingStateTurn: trainingState?.turn,
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
        trainingState = createInitialState(scenario.id, scenario.must_cover_high5);
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
          turn: trainingState.turn,
          scenarioIntro: scenarioIntro.substring(0, 100) + '...'
        });
      }
    } else if (trainingState) {
      isTrainingMode = true;
    }

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        console.log('Stream execute:', { isTrainingMode, hasTrainingState: !!trainingState, turn: trainingState?.turn });
        
        if (isTrainingMode && trainingState) {
          // Training mode: Use judge and agent system
          const userText = message.parts.find(p => p.type === 'text')?.text || '';
          console.log('Training mode active, user text:', userText, 'turn:', trainingState.turn);
          
          // If this is the first message (greeting), just return the scenario intro
          if (scenarioIntro && trainingState.turn === 0) {
            console.log('Returning scenario intro');
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
          
          // Track conversation topics and what BA has addressed
          const userLower = userText.toLowerCase();
          
          // Track topics discussed
          if (userLower.includes('audience') || userLower.includes('guests') || userLower.includes('who')) {
            trainingState.conversationTopics = appendUnique(trainingState.conversationTopics || [], 'audience_described');
          }
          if (userLower.includes('promo') || userLower.includes('special') || userLower.includes('offer')) {
            trainingState.conversationTopics = appendUnique(trainingState.conversationTopics || [], 'promos_described');
          }
          if (userLower.includes('bestseller') || userLower.includes('best seller') || userLower.includes('popular')) {
            trainingState.conversationTopics = appendUnique(trainingState.conversationTopics || [], 'bestsellers_described');
          }
          
          // Track what BA has addressed/agreed to
          if (userLower.includes('one bottle') || userLower.includes('single bottle') || userLower.includes('just one')) {
            trainingState.conversationTopics = appendUnique(trainingState.conversationTopics || [], 'trial_size_agreed');
          }
          if (userLower.includes('custom') || userLower.includes('minimal') || userLower.includes('subtle')) {
            trainingState.conversationTopics = appendUnique(trainingState.conversationTopics || [], 'posm_agreed');
          }
          if (userLower.includes('consignment') || userLower.includes('return') || userLower.includes('take back')) {
            trainingState.conversationTopics = appendUnique(trainingState.conversationTopics || [], 'return_policy_agreed');
          }
          if (userLower.includes('free') || userLower.includes('no cost') || userLower.includes('covered')) {
            trainingState.conversationTopics = appendUnique(trainingState.conversationTopics || [], 'free_trial_agreed');
          }

          // Check if conversation already ended (agent already agreed)
          if (trainingState.done) {
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
            turn: trainingState.turn, 
            userText 
          });
          const agentStart = Date.now();
          
          // Call agent function directly instead of via HTTP
          const agentData = await getAgentResponse(
            trainingState.scenarioId,
            trainingState,
            userText,
            difficulty,
            trainingState.conversationTopics || []
          );
          
          const agentTime = Date.now() - agentStart;
          console.log(`Agent response time: ${agentTime}ms`);
          
          // Simple progress tracking without judge delay
          // Check for agreement in agent's response
          const agentReplyLower = agentData.reply.toLowerCase();
          const agentAgreed = agentReplyLower.includes("alright, let's try") || 
                             agentReplyLower.includes("let's do it") ||
                             agentReplyLower.includes("i'm convinced") ||
                             agentReplyLower.includes("deal") ||
                             agentReplyLower.includes("when can you");
          
          if (agentAgreed) {
            // Mark objectives as complete based on scenario
            if (trainingState.scenarioId === 'product_absent') {
              trainingState.objectives.trialOrder = true;
            } else if (trainingState.scenarioId === 'no_promo') {
              trainingState.objectives.promoAgreed = true;
            } else if (trainingState.scenarioId === 'no_perfect_serve') {
              trainingState.objectives.tapMachine = true;
            }
            // Mark conversation as done immediately
            trainingState.done = true;
          }
          if (agentReplyLower.includes("training") || agentReplyLower.includes("show them")) {
            trainingState.objectives.staffTraining = true;
          }
          
          // Store the latest exchange for hint generation
          trainingState.lastExchange = {
            baMessage: userText,
            ownerResponse: agentData.reply
          };
          
          // Update objections if new one was raised
          if (agentData.suggestedObjectionId && !trainingState.objectionsRaised.includes(agentData.suggestedObjectionId)) {
            trainingState.objectionsRaised = appendUnique(trainingState.objectionsRaised, agentData.suggestedObjectionId);
          }
          
          // Check if scenario is complete
          trainingState.done = isScenarioComplete(trainingState);
          trainingState.turn += 1;
          
          // Store updated conversation topics and state
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
          
          // Check if agreement was reached (but not if still has concerns)
          const agreementPhrases = [
            'deal!', 'let\'s do it', 'let\'s try it', 'i\'m willing to try',
            'we\'ll try it', 'when can you start', 'when can we start',
            'i\'m convinced', 'you\'ve convinced me', 'let\'s give it a shot',
            'let\'s do the trial', 'perfect, let\'s', 'sounds good, let\'s',
            'alright, let\'s do', 'okay, we\'ll try', 'perfect — tomorrow',
            'perfect — let\'s do it', 'alright — i\'m in', 'perfect! tomorrow',
            'see you then', 'we\'ll see you', 'tomorrow at', 'tomorrow works',
            'i\'m in', 'let\'s run a trial', 'we\'re in for', 'great — thanks',
            'confirmed', 'book it', 'schedule the setup'
          ];
          
          const concernPhrases = [
            'but', 'however', 'one more', 'concern', 'worry', 'worried',
            'problem', 'issue', 'how will', 'what about', 'i need to know'
          ];
          
          const replyLower = agentData.reply.toLowerCase();
          const hasAgreement = agreementPhrases.some(phrase => 
            replyLower.includes(phrase)
          );
          const hasConcerns = concernPhrases.some(phrase => 
            replyLower.includes(phrase)
          );
          
          // Check if BA is confirming after agreement
          const baConfirmationWords = ['done', 'confirmed', 'great', 'perfect', 'thanks', 'see you'];
          const isBAConfirming = userText.toLowerCase().split(' ').length <= 3 && 
                                  baConfirmationWords.some(word => userText.toLowerCase().includes(word));
          
          // Only end if there's clear agreement WITHOUT remaining concerns OR BA confirms after agreement
          const isFullAgreement = (hasAgreement && !hasConcerns) || 
                                  (isBAConfirming && trainingState.objectives.tapMachine);
          
          if (trainingState.done || isFullAgreement) {
            // Mark as complete
            trainingState.done = true;
            trainingStates.set(id, trainingState);
            
            // Generate final evaluation summary
            const finalSummary = `
⸻

🎉 **Training Complete!**

**Scenario:** ${scenario.title}
**Result:** ✅ Successfully closed the deal!

**Performance Summary:**
• Turns taken: ${trainingState.turn}
• Objections handled: ${trainingState.objectionsRaised.length}
${trainingState.coveredHigh5.length > 0 ? `• High5 elements covered: ${trainingState.coveredHigh5.join(', ')}` : ''}

**Objectives Achieved:**
${trainingState.objectives.trialOrder ? '✓ Trial order secured' : ''}
${trainingState.objectives.promoAgreed ? '✓ Promotion agreed' : ''}
${trainingState.objectives.staffTraining ? '✓ Staff training scheduled' : ''}
${trainingState.objectives.tapMachine ? '✓ Tap machine/freezer agreed' : ''}

${trainingState.coveredHigh5.length < scenario.must_cover_high5.length ? 
`**Remember next time:** Cover all High5 elements - ${scenario.must_cover_high5.filter((h5: string) => !trainingState.coveredHigh5.includes(h5)).join(', ')}` : 
'**Great job covering all required High5 elements!**'}

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