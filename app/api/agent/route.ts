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

function agentSystem(sc: any) {
  return `Ты — реальный владелец/бар-менеджер on-trade заведения.
Следуй сценарию (persona/intro), соблюдай "global_rules_for_agent".
Всегда поднимай минимум два возражения до согласия.
Сохраняй стиль места и заботу об атмосфере/маржинальности.

High 5 (для понимания намерений BA): ${sc.high5_standards.join("; ")}

Этика/комплаенс (жёстко соблюдай):
- Возрастные ограничения, ответственное потребление, никаких медицинских обещаний.
- Не принимай предложения, нарушающие эстетику или правила бара.

Твоя задача — реалистично отвечать, подкидывая уместные первичные/вторичные барьеры из сценария.
Как только BA уместно закрыл цели и must_cover_high5 — переходи к конструктивной договорённости (но не раньше чем после двух разных возражений).

Отвечай только как "Клиент". Без методических комментариев.`;
}

function userToAgent(sc: any, state: TrainerState, lastTurn: string) {
  return `Сценарий: ${sc.title}
Персона: ${sc.persona}
Вводная: ${sc.intro}
Первичное возражение: ${sc.primary_objection}
Возможные вторичные: ${JSON.stringify(sc.secondary_objection_pool)}

Текущее состояние: 
- Возражений поднято: ${state.objectionsRaised.length}/2
- High5 покрыто: ${state.coveredHigh5.join(", ") || "пока ничего"}
- Цели достигнуты: ${JSON.stringify(state.objectives)}

Последний ход BA: ${lastTurn}

${state.objectionsRaised.length === 0 ? 'ВАЖНО: Это первый ответ, используй первичное возражение.' : ''}
${state.objectionsRaised.length === 1 ? 'ВАЖНО: Уже было одно возражение, теперь используй одно из вторичных возражений.' : ''}
${state.objectionsRaised.length >= 2 && state.coveredHigh5.length >= sc.must_cover_high5.length ? 'Можно идти на конструктивную договорённость, если BA адекватно отработал.' : ''}`;
}

export async function POST(req: NextRequest) {
  try {
    const { scenarioId, state, lastTurn } = await req.json();
    
    const scenario = getScenario(scenarioId);
    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const { text } = await generateText({
      model: xai('grok-2-1212'),
      system: agentSystem(scenariosData),
      prompt: userToAgent(scenario, state, lastTurn),
      temperature: 0.7,
      maxTokens: 500,
    });

    // Determine which objection was raised
    let suggestedObjectionId = null;
    if (state.objectionsRaised.length === 0) {
      suggestedObjectionId = 'primary';
    } else if (state.objectionsRaised.length === 1) {
      suggestedObjectionId = 'secondary_1';
    }

    return NextResponse.json({
      reply: text,
      suggestedObjectionId,
      scenarioContext: {
        title: scenario.title,
        persona: scenario.persona
      }
    });
  } catch (error) {
    console.error('Agent error:', error);
    return NextResponse.json(
      { error: 'Failed to generate agent response' },
      { status: 500 }
    );
  }
}