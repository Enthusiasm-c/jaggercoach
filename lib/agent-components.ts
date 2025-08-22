// Agent Components: Planner, Actor, Critic
import { generateText, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { Memory, MemoryPatch } from './memory-system';
import { z } from 'zod';

// Global system prompt for all components
export const GLOBAL_SYSTEM_PROMPT = `You are "VenueOwner-Simulator", a consistent persona for a sales training simulator.
Non-negotiables:
- Maintain the same tone across turns: calm, skeptical, professional, concise (max 120 words).
- NEVER break character. You are a real person running a business.
- Base all responses on the provided JSON memory state. Do not invent facts.
- Your goal is to simulate a realistic sales conversation, not to be easy.`;

// 1. Planner Component
const plannerSchema = z.object({
  plan: z.string().describe('The high-level plan for the next turn, guiding the Actor.'),
  best_next_action: z.enum(['raise_objection', 'ask_clarifying_question', 'acknowledge_point', 'move_to_closing', 'reject_and_end']).describe('The most logical next conversational move.'),
  confidence_score: z.number().min(0).max(1).describe('Confidence in this plan (0.0-1.0).'),
});

export async function runPlanner(memory: Memory): Promise<z.infer<typeof plannerSchema>> {
  const { object } = await generateObject({
    model: openai('gpt-5-mini'),
    system: `${GLOBAL_SYSTEM_PROMPT}
You are the Planner. Your job is to analyze the current memory state and decide the best strategic move for the next turn.
The Actor will follow your plan. Focus on high-level strategy, not specific wording.
Current FSM state: ${memory.fsm.state}`,
    prompt: `Given the current memory, what is the best plan for the next turn?
Memory:
${JSON.stringify(memory, null, 2)}`,
    schema: plannerSchema,
    temperature: 0.1, // Low temperature for consistent planning
  });
  return object;
}

// 2. Actor Component
const actorSchema = z.object({
  utterance: z.string().describe("The final, natural language response to the user. Must be in character and follow the Planner's guidance."),
  memory_patch: z.object({
    commitments: z.record(z.boolean()).optional().describe('Updates to commitments.'),
    objections: z.object({
      raised: z.array(z.string()).optional(),
      resolved: z.array(z.string()).optional(),
      last_objection: z.string().optional(),
    }).optional().describe('Updates to objections.'),
    high5: z.object({
      covered: z.array(z.string()).optional(),
      last_covered: z.string().optional(),
    }).optional().describe('Updates to High-5 points.'),
    fsm: z.object({
      state: z.enum(['INTRODUCTION', 'OBJECTION_HANDLING', 'CLOSING', 'CONCLUDED']).optional(),
      last_transition: z.string().optional(),
    }).optional().describe('Updates to the Finite State Machine state.'),
  }).describe('A JSON patch to update the memory state. This MUST be valid and reflect the utterance.'),
});

export async function runActor(memory: Memory, plan: any, lastUserUtterance: string): Promise<z.infer<typeof actorSchema>> {
  const { object } = await generateObject({
    model: openai('gpt-5-mini'),
    system: `${GLOBAL_SYSTEM_PROMPT}
You are the Actor. Your job is to generate a natural, in-character response based on the Planner's guidance and the current memory.
You MUST produce a memory_patch that perfectly reflects your utterance.
DO NOT contradict the existing memory state. For example, if a commitment is true, you cannot say you are not committed.`,
    prompt: `User just said: "${lastUserUtterance}"

Current Memory:
${JSON.stringify(memory, null, 2)}

Planner's Guidance:
${JSON.stringify(plan, null, 2)}

Based on the user's message and the plan, generate your response and the corresponding memory patch.`,
    schema: actorSchema,
    temperature: 0.55, // Higher temperature for more natural-sounding language
  });
  return object;
}

// 3. Critic Component
const criticSchema = z.object({
  evaluation: z.enum(['Good', 'Bad', 'Neutral']).describe('Evaluation of the Actor\'s response.'),
  reasoning: z.string().describe('Brief reason for the evaluation.'),
  suggestions_for_improvement: z.string().optional().describe('How the Actor could do better next time.'),
});

export async function runCritic(memory: Memory, actorResponse: any): Promise<z.infer<typeof criticSchema>> {
  const { object } = await generateObject({
    model: openai('gpt-5-mini'),
    system: `${GLOBAL_SYSTEM_PROMPT}
You are the Critic. Your job is to evaluate the Actor's response for consistency, adherence to the persona, and strategic effectiveness.
Your feedback will be used for logging and fine-tuning. Be objective and concise.`,
    prompt: `Evaluating the following turn:

Memory State (before Actor's turn):
${JSON.stringify(memory, null, 2)}

Actor's Response:
${JSON.stringify(actorResponse, null, 2)}

Does the Actor's utterance match the memory_patch?
Is the response in character?
Is it a strategically sound response given the memory?`,
    schema: criticSchema,
    temperature: 0.0, // Zero temperature for deterministic evaluation
  });
  return object;
}
