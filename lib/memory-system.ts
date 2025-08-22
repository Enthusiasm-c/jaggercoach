// Structured Memory System for Conversation State
export interface Memory {
  scenarioId: string;
  persona: {
    role: string;
    tone: string;
    style: string;
    posm_policy: string;
  };
  facts: {
    bar_name: string;
    bar_type: string;
    bar_location: string;
  };
  history: {
    turn: number;
    summary: string;
    conversation: {
      role: 'user' | 'assistant';
      content: string;
    }[];
  };
  commitments: {
    trial: boolean;
    training: boolean;
    posm_accepted: boolean;
    [key: string]: boolean;
  };
  objections: {
    raised: string[];
    resolved: string[];
    last_objection: string | null;
  };
  high5: {
    covered: string[];
    last_covered: string | null;
  };
  fsm: {
    state: 'INTRODUCTION' | 'OBJECTION_HANDLING' | 'CLOSING' | 'CONCLUDED';
    last_transition: string;
  };
}

// MemoryPatch is a partial update to the memory
export type MemoryPatch = Partial<{
  commitments: Partial<Memory['commitments']>;
  objections: Partial<Memory['objections']>;
  high5: Partial<Memory['high5']>;
  fsm: Partial<Memory['fsm']>;
}>;

// Initial memory state for a new conversation
export const initialMemory = (scenario: any): Memory => ({
  scenarioId: scenario.id,
  persona: {
    role: scenario.persona,
    tone: 'calm-skeptical',
    style: 'concise',
    posm_policy: scenario.posm_policy || 'neutral',
  },
  facts: {
    bar_name: scenario.bar_name,
    bar_type: scenario.bar_type,
    bar_location: scenario.bar_location,
  },
  history: {
    turn: 0,
    summary: 'Conversation has not started yet.',
    conversation: [],
  },
  commitments: {
    trial: false,
    training: false,
    posm_accepted: false,
  },
  objections: {
    raised: [],
    resolved: [],
    last_objection: null,
  },
  high5: {
    covered: [],
    last_covered: null,
  },
  fsm: {
    state: 'INTRODUCTION',
    last_transition: 'init',
  },
});

// Function to apply a patch to memory
export function applyMemoryPatch(memory: Memory, patch: MemoryPatch): Memory {
  const newMemory = { ...memory };

  if (patch.commitments) {
    newMemory.commitments = { ...newMemory.commitments, ...patch.commitments };
  }
  if (patch.objections) {
    newMemory.objections = {
      ...newMemory.objections,
      ...patch.objections,
      raised: [
        ...new Set([...newMemory.objections.raised, ...(patch.objections.raised || [])]),
      ],
      resolved: [
        ...new Set([...newMemory.objections.resolved, ...(patch.objections.resolved || [])]),
      ],
    };
  }
  if (patch.high5) {
    newMemory.high5 = {
      ...newMemory.high5,
      ...patch.high5,
      covered: [
        ...new Set([...newMemory.high5.covered, ...(patch.high5.covered || [])]),
      ],
    };
  }
  if (patch.fsm) {
    newMemory.fsm = { ...newMemory.fsm, ...patch.fsm };
  }

  return newMemory;
}

// Validation function (basic example)
export function validateMemory(memory: Memory): boolean {
  if (memory.history.turn < 0) return false;
  if (!memory.fsm.state) return false;
  // Add more complex validation rules here
  return true;
}
