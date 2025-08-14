'use client';

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { TrainerState, createInitialState, appendUnique, updateObjectives, isScenarioComplete } from '@/lib/trainer-state';
import { Toaster, toast } from 'sonner';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

type Message = {
  role: 'ba' | 'client' | 'system';
  content: string;
  evaluation?: any;
};

const scenarios = [
  { id: 'product_absent', title: 'Продукта нет', mustCover: ['Menu + Price', 'Promo', 'Staff'] },
  { id: 'no_promo', title: 'Продукт есть, но нет промо', mustCover: ['Visibility', 'Promo', 'Staff'] },
  { id: 'no_perfect_serve', title: 'Нет Perfect Serve', mustCover: ['Ice Cold Serve', 'Visibility', 'Menu + Price'] }
];

const HIGH5_ITEMS = [
  'Ice Cold Serve',
  'Menu + Price',
  'Visibility',
  'Promo',
  'Staff'
];

export default function TrainingPage() {
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [state, setState] = useState<TrainerState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const startScenario = (scenarioId: string) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const newState = createInitialState(scenarioId as any, scenario.mustCover);
    setState(newState);
    setSelectedScenario(scenarioId);
    setMessages([{
      role: 'system',
      content: `Сценарий "${scenario.title}" начат. Представьтесь и начните диалог с владельцем/менеджером заведения.`
    }]);
  };

  const sendMessage = async () => {
    if (!input.trim() || !state || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add BA message
    setMessages(prev => [...prev, { role: 'ba', content: userMessage }]);

    try {
      // First, get evaluation from judge
      const judgeResponse = await fetch('/api/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: state.scenarioId,
          state,
          lastBA: userMessage
        })
      });

      if (!judgeResponse.ok) throw new Error('Judge evaluation failed');
      const evaluation = await judgeResponse.json();

      // Update state based on evaluation
      let newState = { ...state };
      
      // Update covered High5
      if (evaluation.closed_high5_delta && evaluation.closed_high5_delta.length > 0) {
        evaluation.closed_high5_delta.forEach((h5: string) => {
          newState.coveredHigh5 = appendUnique(newState.coveredHigh5, h5);
        });
      }

      // Update objectives
      if (evaluation.objective_delta && Object.keys(evaluation.objective_delta).length > 0) {
        newState.objectives = updateObjectives(newState.objectives, evaluation.objective_delta);
      }

      // Check for risk flags
      if (evaluation.risk_flags && evaluation.risk_flags.length > 0) {
        evaluation.risk_flags.forEach((flag: string) => {
          if (flag === 'irresponsible_serving') {
            toast.error('Внимание: Нарушение принципов ответственного потребления!', {
              icon: <AlertCircle className="h-4 w-4" />
            });
          } else if (flag === 'discount_only_focus') {
            toast.warning('Слишком большой упор на скидки. Баланс продаж и имиджа!');
          } else if (flag === 'unrealistic_promise') {
            toast.warning('Нереалистичные обещания. Будьте честны с клиентом!');
          }
        });
      }

      // Update messages with evaluation
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].evaluation = evaluation;
        return updated;
      });

      // Get agent response
      const agentResponse = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: state.scenarioId,
          state: newState,
          lastTurn: userMessage
        })
      });

      if (!agentResponse.ok) throw new Error('Agent response failed');
      const agentData = await agentResponse.json();

      // Update objections if new one was raised
      if (agentData.suggestedObjectionId && !newState.objectionsRaised.includes(agentData.suggestedObjectionId)) {
        newState.objectionsRaised = appendUnique(newState.objectionsRaised, agentData.suggestedObjectionId);
      }

      // Check if scenario is complete
      newState.done = isScenarioComplete(newState);
      newState.turn += 1;

      setState(newState);
      setMessages(prev => [...prev, { role: 'client', content: agentData.reply }]);

      if (newState.done) {
        toast.success('Сценарий успешно завершен!', {
          icon: <CheckCircle2 className="h-4 w-4" />
        });
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Ошибка при обработке сообщения');
    } finally {
      setIsLoading(false);
    }
  };

  const resetScenario = () => {
    setSelectedScenario(null);
    setState(null);
    setMessages([]);
    setInput('');
  };

  if (!selectedScenario) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="max-w-2xl w-full p-8">
          <h1 className="text-2xl font-bold mb-6">Тренажер Jägermeister High 5</h1>
          <p className="text-gray-600 mb-6">
            Выберите сценарий для отработки навыков продаж по стандартам High 5
          </p>
          <div className="space-y-4">
            {scenarios.map(scenario => (
              <Button
                key={scenario.id}
                onClick={() => startScenario(scenario.id)}
                className="w-full justify-start text-left h-auto p-4"
                variant="outline"
              >
                <div>
                  <div className="font-semibold">{scenario.title}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    Необходимо покрыть: {scenario.mustCover.join(', ')}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Toaster position="top-center" />
      
      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b p-4 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">
                {scenarios.find(s => s.id === selectedScenario)?.title}
              </h1>
              <p className="text-sm text-gray-500">
                Ход {state?.turn || 0} | Возражений: {state?.objectionsRaised.length || 0}/2
              </p>
            </div>
            <Button onClick={resetScenario} variant="ghost" size="sm">
              <X className="h-4 w-4 mr-1" />
              Завершить
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.map((message, idx) => (
            <div key={idx}>
              <div className={cn(
                "p-4 rounded-lg",
                message.role === 'ba' && "bg-blue-50 ml-12",
                message.role === 'client' && "bg-gray-50 mr-12",
                message.role === 'system' && "bg-yellow-50 text-center text-sm italic"
              )}>
                <div className="font-semibold text-sm mb-1">
                  {message.role === 'ba' && 'Brand Ambassador'}
                  {message.role === 'client' && 'Клиент'}
                </div>
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
              
              {message.evaluation && (
                <div className="mt-2 ml-12 p-3 bg-purple-50 rounded-lg text-sm">
                  <div className="font-semibold mb-1">Оценка тренера:</div>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <div>Discovery: {message.evaluation.scores?.discovery || 0}/3</div>
                    <div>Objection: {message.evaluation.scores?.objection_handling || 0}/3</div>
                    <div>Balance: {message.evaluation.scores?.brand_balance || 0}/2</div>
                    <div>Clarity: {message.evaluation.scores?.clarity_brevity || 0}/2</div>
                  </div>
                  {message.evaluation.commentary && (
                    <div className="text-gray-600 mb-1">{message.evaluation.commentary}</div>
                  )}
                  {message.evaluation.action_drill && (
                    <div className="text-blue-600 font-medium">
                      💡 {message.evaluation.action_drill}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          
          {state?.done && (
            <div className="p-4 bg-green-50 rounded-lg text-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <div className="font-semibold">Сценарий успешно завершен!</div>
              <Button onClick={resetScenario} className="mt-3">
                Выбрать другой сценарий
              </Button>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Введите ваш ответ..."
              className="flex-1"
              rows={3}
              disabled={isLoading || state?.done}
            />
            <Button 
              onClick={sendMessage}
              disabled={isLoading || !input.trim() || state?.done}
            >
              {isLoading ? 'Отправка...' : 'Отправить'}
            </Button>
          </div>
        </div>
      </div>

      {/* Right sidebar with progress */}
      <div className="w-80 border-l p-4 bg-gray-50">
        <div className="space-y-6">
          {/* High 5 Progress */}
          <div>
            <h3 className="font-semibold mb-3">Прогресс High 5</h3>
            <div className="space-y-2">
              {HIGH5_ITEMS.map(item => {
                const isCovered = state?.coveredHigh5.includes(item);
                const isRequired = state?.mustCoverHigh5.includes(item);
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
            <h3 className="font-semibold mb-3">Цели сценария</h3>
            <div className="space-y-2">
              {state?.scenarioId === 'product_absent' && (
                <>
                  <ObjectiveItem 
                    label="Пробный заказ (2-3 бутылки)" 
                    completed={state.objectives.trialOrder} 
                  />
                  <ObjectiveItem 
                    label="Обучение персонала" 
                    completed={state.objectives.staffTraining} 
                  />
                </>
              )}
              {state?.scenarioId === 'no_promo' && (
                <>
                  <ObjectiveItem 
                    label="Промо-активация согласована" 
                    completed={state.objectives.promoAgreed} 
                  />
                  <ObjectiveItem 
                    label="Обучение персонала" 
                    completed={state.objectives.staffTraining} 
                  />
                </>
              )}
              {state?.scenarioId === 'no_perfect_serve' && (
                <ObjectiveItem 
                  label="Tap Machine/морозилка" 
                  completed={state.objectives.tapMachine} 
                />
              )}
            </div>
          </div>

          {/* Objections Counter */}
          <div>
            <h3 className="font-semibold mb-3">Возражения</h3>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1].map(i => (
                  <div
                    key={i}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 flex items-center justify-center",
                      i < (state?.objectionsRaised.length || 0)
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300"
                    )}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <span className="text-sm text-gray-600">
                {state?.objectionsRaised.length || 0} из 2 обработано
              </span>
            </div>
          </div>
        </div>
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