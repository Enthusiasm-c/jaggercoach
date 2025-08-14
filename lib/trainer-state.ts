export type TrainerState = {
  scenarioId: "product_absent" | "no_promo" | "no_perfect_serve";
  turn: number;
  objectionsRaised: string[];          // идентификаторы поднятых возражений
  coveredHigh5: string[];              // какие High 5 уже закрыты по сути разговора
  objectives: {                        // прогресс по целям
    trialOrder?: boolean;
    promoAgreed?: boolean;
    staffTraining?: boolean;
    tapMachine?: boolean;
  };
  mustCoverHigh5: string[];            // из сценария
  done: boolean;
};

export function createInitialState(scenarioId: TrainerState['scenarioId'], mustCoverHigh5: string[]): TrainerState {
  return {
    scenarioId,
    turn: 0,
    objectionsRaised: [],
    coveredHigh5: [],
    objectives: {},
    mustCoverHigh5,
    done: false
  };
}

export function appendUnique(arr: string[], item: string): string[] {
  if (!arr.includes(item)) {
    return [...arr, item];
  }
  return arr;
}

export function updateObjectives(
  current: TrainerState['objectives'],
  delta: Partial<TrainerState['objectives']>
): TrainerState['objectives'] {
  return {
    ...current,
    ...Object.entries(delta).reduce((acc, [key, value]) => {
      if (value === true) {
        acc[key as keyof TrainerState['objectives']] = true;
      }
      return acc;
    }, {} as TrainerState['objectives'])
  };
}

export function isScenarioComplete(state: TrainerState): boolean {
  // Check if all must-cover High5 are covered
  const allHigh5Covered = state.mustCoverHigh5.every(h5 => 
    state.coveredHigh5.includes(h5)
  );
  
  // Check if minimum objections raised (2)
  const minObjectionsMet = state.objectionsRaised.length >= 2;
  
  // Check scenario-specific objectives
  let objectivesMet = false;
  switch(state.scenarioId) {
    case 'product_absent':
      objectivesMet = !!(state.objectives.trialOrder && state.objectives.staffTraining);
      break;
    case 'no_promo':
      objectivesMet = !!(state.objectives.promoAgreed && state.objectives.staffTraining);
      break;
    case 'no_perfect_serve':
      objectivesMet = !!state.objectives.tapMachine;
      break;
  }
  
  return allHigh5Covered && minObjectionsMet && objectivesMet;
}