import { NextRequest, NextResponse } from 'next/server';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { TrainerState } from '@/lib/trainer-state';

export const runtime = "nodejs";

// Load scenarios
const scenariosPath = path.join(process.cwd(), 'scenarios', 'jaeger_high5.yaml');
const scenariosContent = fs.readFileSync(scenariosPath, 'utf8');
const scenariosData = yaml.load(scenariosContent) as any;

function getScenario(scenarioId: string) {
  return scenariosData.scenarios.find((s: any) => s.id === scenarioId);
}

function judgePrompt(sc: any, state: TrainerState, lastBA: string) {
  return `Ты — строгий тренер по продажам для бренд-амбасадоров Jägermeister.
Оцени последний ход BA по рубрике (per_turn/final), High 5 и этике.

Рубрика (per_turn): ${JSON.stringify(sc.rubric.per_turn)}
Финальные критерии: ${JSON.stringify(sc.rubric.final)}
Must-cover High5: ${JSON.stringify(sc.must_cover_high5 || [])}
Глобальные правила: минимум два возражения до согласия.

State: ${JSON.stringify(state)}
Ход BA: ${lastBA}

Верни строго JSON:
{
  "scores": { 
    "discovery": 0-3, 
    "objection_handling": 0-3, 
    "brand_balance": 0-2, 
    "clarity_brevity": 0-2 
  },
  "commentary": "2-4 конкретных предложения как улучшить следующую реплику",
  "closed_high5_delta": ["Promo"],
  "uncovered_high5": ["Ice Cold Serve", "..."],
  "objective_delta": { 
    "trialOrder": true|false, 
    "promoAgreed": true|false, 
    "staffTraining": true|false, 
    "tapMachine": true|false 
  },
  "objections_count": 0,
  "risk_flags": ["discount_only_focus","irresponsible_serving","unrealistic_promise"],
  "action_drill": "одно микро-упражнение на следующий ход",
  "final_ready": true|false,
  "final_outcome": "кратко, если final_ready=true"
}

Отмечай risk_flags, если BA уходит в скидки, обещает недостижимое или нарушает ответственность.`;
}

export async function POST(req: NextRequest) {
  try {
    const { scenarioId, state, lastBA } = await req.json();
    
    const scenario = getScenario(scenarioId);
    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const { text } = await generateText({
      model: xai('grok-2-1212'),
      system: 'You are a strict sales trainer evaluating BA performance. Return ONLY valid JSON.',
      prompt: judgePrompt(scenariosData, state, lastBA),
      temperature: 0.3,
      maxTokens: 800,
    });

    // Parse JSON response
    let evaluation;
    try {
      // Clean the response - remove any non-JSON content
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse judge response:', text);
      // Return a default evaluation
      evaluation = {
        scores: {
          discovery: 1,
          objection_handling: 1,
          brand_balance: 1,
          clarity_brevity: 1
        },
        commentary: "Ошибка парсинга ответа. Попробуйте еще раз.",
        closed_high5_delta: [],
        uncovered_high5: scenario.must_cover_high5,
        objective_delta: {},
        objections_count: state.objectionsRaised.length,
        risk_flags: [],
        action_drill: "Продолжайте работу с возражениями",
        final_ready: false,
        final_outcome: ""
      };
    }

    // Ensure all required fields exist
    evaluation = {
      scores: evaluation.scores || { discovery: 0, objection_handling: 0, brand_balance: 0, clarity_brevity: 0 },
      commentary: evaluation.commentary || "",
      closed_high5_delta: evaluation.closed_high5_delta || [],
      uncovered_high5: evaluation.uncovered_high5 || [],
      objective_delta: evaluation.objective_delta || {},
      objections_count: evaluation.objections_count || state.objectionsRaised.length,
      risk_flags: evaluation.risk_flags || [],
      action_drill: evaluation.action_drill || "",
      final_ready: evaluation.final_ready || false,
      final_outcome: evaluation.final_outcome || ""
    };

    return NextResponse.json(evaluation);
  } catch (error) {
    console.error('Judge error:', error);
    return NextResponse.json(
      { error: 'Failed to generate judge evaluation' },
      { status: 500 }
    );
  }
}