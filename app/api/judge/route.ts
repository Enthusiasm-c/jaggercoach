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

function judgePrompt(sc: any, state: TrainerState, conversationHistory: Array<{role: string, message: string}>, difficulty: string = 'medium') {
  const interactionLimits = {
    easy: 2,
    medium: 3,
    hard: 4
  };
  
  const limit = interactionLimits[difficulty as keyof typeof interactionLimits] || 3;
  
  return `You are the FINAL EVALUATOR for Jägermeister BA training.

==[ EVALUATION CONTEXT ]==
Scenario: ${sc.title}
Bar Owner: ${sc.persona} at ${sc.bar_name}
Difficulty: ${difficulty.toUpperCase()} (${limit} interactions max)
Primary Objection: ${sc.primary_objection}

==[ YOUR ROLE ]==
1. DO NOT INTERVENE during the conversation
2. DO NOT PROVIDE hints during the dialogue
3. ONLY evaluate AFTER all ${limit} interactions are complete
4. Provide ONE comprehensive final report

==[ CONVERSATION TO EVALUATE ]==
${conversationHistory.map((turn, i) => `${turn.role}: ${turn.message}`).join('\n')}

==[ SCORING CRITERIA ]==
• discovery (0-3): Did BA ask good discovery questions about venue needs?
• objection_handling (0-3): How well did BA address each objection with specific solutions?
• clarity (0-2): Clear, concise communication without rambling?
• brand_balance (0-2): Balanced brand value with commercial offers?

==[ HIGH-5 ELEMENTS TO CHECK ]==
Required for this scenario: ${JSON.stringify(sc.must_cover_high5 || [])}
• Ice Cold Serve: -18°C, tap/freezer discussions
• Visibility: POSM, menu placement
• Promo: Offers, trials, deals
• Staff: Training mentions
• Menu + Price: Pricing discussions

==[ RISK FLAGS TO CHECK ]==
Flag ONLY if BA:
• Focused only on discounts (no brand building)
• Made unrealistic promises (300% growth, etc.)
• Violated responsible serving
• Was pushy or aggressive

==[ OUTPUT FORMAT - JSON ONLY ]==
{
  "final_evaluation": {
    "outcome": "SUCCESS" or "FAILURE",
    "scores": {
      "discovery": 0-3,
      "objection_handling": 0-3,
      "clarity": 0-2,
      "brand_balance": 0-2
    },
    "total_score": 0-10,
    "grade": "A/B/C/D/F"
  },
  "summary": "2-3 sentence summary of overall performance",
  "strengths": ["What BA did well", "Another strength"],
  "improvements": ["Area to improve", "Another area"],
  "high5_coverage": {
    "required": ["list of required elements"],
    "covered": ["what was actually covered"],
    "missed": ["what was missed"]
  },
  "risk_flags": ["any violations"],
  "key_moments": [
    {"interaction": 1, "highlight": "What stood out"},
    {"interaction": 2, "highlight": "Key moment"}
  ],
  "recommendation": "One specific tip for next time"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const { scenarioId, state, conversationHistory, difficulty = 'medium', isFinal = false } = await req.json();
    
    const scenario = getScenario(scenarioId);
    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    // Only provide evaluation if conversation is complete
    if (!isFinal) {
      return NextResponse.json({
        message: "Judge only evaluates after all interactions are complete",
        waiting: true
      });
    }

    const { text } = await generateText({
      model: openai('gpt-5-mini'),
      system: judgePrompt(scenario, state, conversationHistory, difficulty),
      prompt: `Provide the FINAL evaluation of this complete ${difficulty} difficulty conversation.
The conversation has ended. Evaluate the BA's overall performance.
Return JSON only as specified.`,
      temperature: 0.3,
    });

    // Parse the response as JSON
    try {
      const evaluation = JSON.parse(text);
      return NextResponse.json(evaluation);
    } catch (parseError) {
      console.error('Failed to parse judge response:', text);
      // Return a default evaluation if parsing fails
      return NextResponse.json({
        final_evaluation: {
          outcome: "ERROR",
          scores: {
            discovery: 0,
            objection_handling: 0,
            clarity: 0,
            brand_balance: 0
          },
          total_score: 0,
          grade: "F"
        },
        summary: "Evaluation could not be completed due to technical error.",
        strengths: [],
        improvements: ["Please try again"],
        high5_coverage: {
          required: scenario.must_cover_high5 || [],
          covered: [],
          missed: scenario.must_cover_high5 || []
        },
        risk_flags: [],
        key_moments: [],
        recommendation: "Please retry the scenario"
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