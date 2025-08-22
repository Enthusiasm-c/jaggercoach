import {
  Memory,
  MemoryPatch,
  applyMemoryPatch,
  validateMemory,
} from './memory-system';
import { runPlanner, runActor, runCritic } from './agent-components';

export async function agentPipeline(
  memory: Memory,
  lastUserUtterance: string,
) {
  // 1. Run Planner
  const plan = await runPlanner(memory);

  // 2. Run Actor
  const actorResponse = await runActor(memory, plan, lastUserUtterance);

  // 3. Run Critic
  const criticResponse = await runCritic(memory, actorResponse);

  // 4. Validate and apply memory patch
  // In a real system, you'd have more robust validation here
  const newMemory = applyMemoryPatch(memory, actorResponse.memory_patch);
  const isMemoryValid = validateMemory(newMemory);

  if (!isMemoryValid) {
    // Handle invalid memory state, e.g., by logging an error
    // and returning a fallback response.
    console.error('Invalid memory state produced by agent.');
    // For now, we'll proceed, but in a production system,
    // we might want to prevent the state from being updated.
  }

  // 5. Return all results for logging and state management
  return {
    plan,
    actorResponse,
    criticResponse,
    newMemory,
    reply: actorResponse.utterance,
  };
}
