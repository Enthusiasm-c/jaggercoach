'use client';

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrainerState } from '@/lib/trainer-state';

const HIGH5_ITEMS = [
  'Ice Cold Serve',
  'Menu + Price',
  'Visibility',
  'Promo',
  'Staff'
];

interface TrainingSidebarProps {
  state: TrainerState | null;
}

export function TrainingSidebar({ state }: TrainingSidebarProps) {
  if (!state) return null;

  return (
    <div className="w-80 border-l p-4 bg-gray-50 h-full">
      <div className="space-y-6">
        {/* Scenario Info */}
        <div>
          <h3 className="font-semibold mb-2">High 5 Training</h3>
          <p className="text-sm text-gray-600">
            Turn {state.turn} | Objections: {state.objectionsRaised.length}/2
          </p>
        </div>

        {/* High 5 Progress */}
        <div>
          <h3 className="font-semibold mb-3">High 5 Progress</h3>
          <div className="space-y-2">
            {HIGH5_ITEMS.map(item => {
              const isCovered = state.coveredHigh5.includes(item);
              const isRequired = state.mustCoverHigh5.includes(item);
              return (
                <div 
                  key={item}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded",
                    isCovered && "bg-green-100",
                    !isCovered && isRequired && "bg-yellow-50"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center",
                    isCovered ? "border-green-600 bg-green-600" : "border-gray-300"
                  )}>
                    {isCovered && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </div>
                  <span className={cn(
                    "text-sm",
                    isCovered && "font-medium",
                    isRequired && !isCovered && "font-medium text-orange-600"
                  )}>
                    {item}
                    {isRequired && !isCovered && ' *'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Objectives */}
        <div>
          <h3 className="font-semibold mb-3">Scenario Objectives</h3>
          <div className="space-y-2">
            {state.scenarioId === 'product_absent' && (
              <>
                <ObjectiveItem 
                  label="Trial order (2-3 bottles)" 
                  completed={state.objectives.trialOrder} 
                />
                <ObjectiveItem 
                  label="Staff training" 
                  completed={state.objectives.staffTraining} 
                />
              </>
            )}
            {state.scenarioId === 'no_promo' && (
              <>
                <ObjectiveItem 
                  label="Promo activation agreed" 
                  completed={state.objectives.promoAgreed} 
                />
                <ObjectiveItem 
                  label="Staff training" 
                  completed={state.objectives.staffTraining} 
                />
              </>
            )}
            {state.scenarioId === 'no_perfect_serve' && (
              <ObjectiveItem 
                label="Tap Machine/freezer" 
                completed={state.objectives.tapMachine} 
              />
            )}
          </div>
        </div>

        {/* Objections Counter */}
        <div>
          <h3 className="font-semibold mb-3">Objections</h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[0, 1].map(i => (
                <div
                  key={i}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 flex items-center justify-center",
                    i < state.objectionsRaised.length
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-300"
                  )}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            <span className="text-sm text-gray-600">
              {state.objectionsRaised.length} of 2 handled
            </span>
          </div>
        </div>

        {state.done && (
          <div className="p-3 bg-green-50 rounded-lg text-center">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
            <div className="text-sm font-semibold text-green-700">
              Scenario Complete!
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ObjectiveItem({ label, completed }: { label: string; completed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-4 h-4 rounded border-2",
        completed ? "border-green-600 bg-green-600" : "border-gray-300"
      )}>
        {completed && <CheckCircle2 className="h-3 w-3 text-white" />}
      </div>
      <span className={cn("text-sm", completed && "line-through text-gray-500")}>
        {label}
      </span>
    </div>
  );
}