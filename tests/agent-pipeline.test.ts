import { agentPipeline } from '../lib/agent-pipeline';
import { initialMemory } from '../lib/memory-system';
import { generateObject } from 'ai';

// Mock the generateObject function from the 'ai' library.
// This allows us to simulate the behavior of the AI models for Planner, Actor, and Critic.
jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  generateObject: jest.fn(),
}));

// Cast the mocked function to its mock type to allow for mock implementations.
const mockedGenerateObject = generateObject as jest.Mock;

describe('Agent Pipeline', () => {
  // Reset mocks before each test to ensure a clean slate.
  beforeEach(() => {
    mockedGenerateObject.mockReset();
  });

  it('should run the full pipeline and return a response, updating memory correctly', async () => {
    // 1. Setup mock responses for each component in the pipeline.
    mockedGenerateObject
      .mockResolvedValueOnce({ // Mock for Planner
        object: {
            plan: 'The user is hesitant. Acknowledge their concern and ask a clarifying question to understand the root cause.',
            best_next_action: 'ask_clarifying_question',
            confidence_score: 0.9,
        }
      })
      .mockResolvedValueOnce({ // Mock for Actor
        object: {
            utterance: 'I understand you have some concerns. Could you tell me a bit more about what\'s on your mind?',
            memory_patch: {
                fsm: {
                    state: 'OBJECTION_HANDLING',
                    last_transition: 'inquired_about_concerns',
                },
                objections: {
                    last_objection: 'User is unsure',
                }
            },
        }
      })
      .mockResolvedValueOnce({ // Mock for Critic
        object: {
            evaluation: 'Good',
            reasoning: 'The actor followed the plan, stayed in character, and correctly updated the memory state.',
        }
      });

    // 2. Define the initial state for the test.
    const scenario = {
        id: 'test-scenario-1',
        persona: 'Cautious Bar Owner',
        bar_name: 'The Salty Spitoon',
        bar_type: 'Dive Bar',
        bar_location: 'Bikini Bottom',
        posm_policy: 'strict',
    };
    const memory = initialMemory(scenario);
    const lastUserUtterance = 'I\'m not so sure about this whole Jägermeister thing.';

    // 3. Execute the pipeline.
    const result = await agentPipeline(memory, lastUserUtterance);

    // 4. Assert the results.
    // Check if the final reply is what the Actor generated.
    expect(result.reply).toBe('I understand you have some concerns. Could you tell me a bit more about what\'s on your mind?');

    // Check if the memory has been updated correctly by the patch.
    expect(result.newMemory.fsm.state).toBe('OBJECTION_HANDLING');
    expect(result.newMemory.fsm.last_transition).toBe('inquired_about_concerns');
    expect(result.newMemory.objections.last_objection).toBe('User is unsure');

    // Verify that all three components (Planner, Actor, Critic) were called.
    expect(mockedGenerateObject).toHaveBeenCalledTimes(3);

    // Optional: A more detailed check on the arguments passed to the mocks if needed.
    // This can ensure each component is receiving the correct state.
    expect(mockedGenerateObject.mock.calls[0][0].prompt).toContain('"state": "INTRODUCTION"'); // Planner gets initial state
    expect(mockedGenerateObject.mock.calls[1][0].prompt).toContain('User just said: "I\'m not so sure about this whole Jägermeister thing."'); // Actor gets user utterance
    expect(mockedGenerateObject.mock.calls[2][0].prompt).toContain('"utterance": "I understand you have some concerns.'); // Critic evaluates actor response
  });
});
