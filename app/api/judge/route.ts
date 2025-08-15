import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { TrainerState } from '@/lib/trainer-state';

// Load scenarios
const scenariosPath = path.join(process.cwd(), 'scenarios', 'jaeger_high5.yaml');
const scenariosContent = fs.readFileSync(scenariosPath, 'utf8');
const scenariosData = yaml.load(scenariosContent) as any;

function getScenario(scenarioId: string) {
  return scenariosData.scenarios.find((s: any) => s.id === scenarioId);
}

function judgePrompt(sc: any, state: TrainerState, lastBA: string, lastOwnerResponse?: string) {
  return `You are a supportive, practical sales coach for Jägermeister BAs.
Your job: evaluate the BA's last response and provide a SPECIFIC, CONTEXTUAL hint for their NEXT response.

SCENARIO CONTEXT:
• Title: ${sc.title}
• Bar Owner: ${sc.persona}
• Main Challenge: ${sc.primary_objection}
• Turn Number: ${state.turn}

LAST EXCHANGE:
• BA said: "${lastBA}"
• Owner's likely concerns: ${sc.secondary_objection_pool ? JSON.stringify(sc.secondary_objection_pool) : 'unknown'}

Scoring guidelines:
• discovery: 0–3 (quality of venue questions about needs, challenges, current setup)
• objection_handling: 0–3 (how well objections were addressed with practical solutions)
• brand_balance: 0–2 (sales + brand image balance, not just discounts)
• clarity_brevity: 0–2 (clear, concise speech without rambling)

High 5 Elements to Track:
• Ice Cold Serve (–18°C, Tap Machine/Freezer, clean service)
• Menu + Price (visibility in menu, correct price)
• Visibility (POSM, design fit)
• Promo (guest-facing: group serve, 2+1, digital/table tent)
• Staff (training, engagement)

Must-cover High5 for this scenario: ${JSON.stringify(sc.must_cover_high5 || [])}

Current progress:
• Objectives achieved: ${JSON.stringify(state.objectives)}
• High5 covered: ${state.coveredHigh5.join(', ') || 'none yet'}

Return strictly JSON format only:
{
  "scores": {
    "discovery": 0,
    "objection_handling": 0,
    "brand_balance": 0,
    "clarity_brevity": 0
  },
  "commentary": "Positive feedback focusing on sales technique, not just High5 checklist",
  "closed_high5_delta": ["Elements covered this turn"],
  "uncovered_high5": ["Elements still to cover"],
  "objective_delta": {
    "trialOrder": false,
    "promoAgreed": false,
    "staffTraining": false,
    "tapMachine": false
  },
  "objections_count": 0,
  "risk_flags": ["discount_only_focus", "irresponsible_serving", "unrealistic_promise"],
  "action_drill": "SPECIFIC hint for the NEXT response based on where the conversation is NOW (e.g., 'Ask about their peak hours and current shot prices' or 'Offer free trial with money-back guarantee' or 'Mention the 50% sales increase data')",
  "final_ready": false,
  "final_outcome": "Brief summary if scenario complete"
}

Flag risk_flags only if BA:
- Focuses only on discounts without brand building
- Promises unrealistic results
- Violates responsible serving principles`;
}

export async function POST(req: NextRequest) {
  try {
    const { scenarioId, state, lastBA, lastOwnerResponse } = await req.json();
    
    const scenario = getScenario(scenarioId);
    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const { text } = await generateText({
      model: openai('gpt-5-mini'),
      system: judgePrompt(scenario, state, lastBA, lastOwnerResponse),
      prompt: `Evaluate the BA's response and provide a CONTEXTUAL hint.
The bar owner just responded with: "${lastOwnerResponse || 'starting conversation'}"
What should the BA say NEXT to address this specific response?
Return JSON only.`,
      temperature: 0.3,
      maxTokens: 1000,
    });

    // Parse the response as JSON
    try {
      const evaluation = JSON.parse(text);
      return NextResponse.json(evaluation);
    } catch (parseError) {
      console.error('Failed to parse judge response:', text);
      // Return a default evaluation if parsing fails
      return NextResponse.json({
        scores: {
          discovery: 1,
          objection_handling: 1,
          brand_balance: 1,
          clarity_brevity: 1
        },
        commentary: "Good effort! Keep focusing on addressing the owner's specific concerns.",
        closed_high5_delta: [],
        uncovered_high5: scenario.must_cover_high5 || [],
        objective_delta: {},
        objections_count: state.objectionsRaised.length,
        risk_flags: [],
        action_drill: "Try asking more discovery questions about the venue's needs.",
        final_ready: false,
        final_outcome: ""
      });
    }
  } catch (error) {
    console.error('Judge error:', error);
    return NextResponse.json(
      { error: 'Failed to evaluate response' },
      { status: 500 }
    );
  }
}