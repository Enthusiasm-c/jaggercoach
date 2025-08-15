import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Load scenarios
const scenariosPath = path.join(process.cwd(), 'scenarios', 'jaeger_high5.yaml');
const scenariosContent = fs.readFileSync(scenariosPath, 'utf8');
const scenariosData = yaml.load(scenariosContent) as any;

function getScenario(scenarioId: string) {
  return scenariosData.scenarios.find((s: any) => s.id === scenarioId);
}

function hintPrompt(scenario: any, lastBA: string, lastOwner: string, state: any) {
  return `You are a supportive Jägermeister sales coach providing real-time hints.

CURRENT SITUATION:
Scenario: ${scenario.title}
Bar Owner: ${scenario.persona}
Challenge: ${scenario.primary_objection}

LAST EXCHANGE:
BA said: "${lastBA}"
Owner replied: "${lastOwner}"

PROGRESS:
• Turn: ${state.turn}
• Objectives completed: ${Object.entries(state.objectives || {}).filter(([k, v]) => v).map(([k]) => k).join(', ') || 'none'}
• High5 elements to cover: ${scenario.must_cover_high5?.join(', ')}

Based on the owner's latest response, provide ONE specific, actionable hint for what the BA should say next.
Focus on addressing the owner's current concern or moving the conversation forward.

Examples of good hints:
- "Acknowledge their concern about cost, then mention the free trial with money-back guarantee"
- "Ask about their busiest nights and what shots currently sell best"
- "Offer to do a staff tasting next Tuesday at 4pm before service"
- "Mention the 50-70% sales increase other bars have seen"
- "Suggest starting with just 2 bottles on consignment to minimize risk"

Return ONLY the hint text, no JSON or formatting.`;
}

export async function POST(req: NextRequest) {
  try {
    const { scenarioId, lastBA, lastOwner, state } = await req.json();
    
    const scenario = getScenario(scenarioId);
    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const { text } = await generateText({
      model: openai('gpt-4o-mini'), // Use faster model for hints
      system: hintPrompt(scenario, lastBA, lastOwner, state),
      prompt: 'Generate a specific hint for the next response.',
      temperature: 0.3,
    });

    return NextResponse.json({ hint: text.trim() });
  } catch (error) {
    console.error('Hint generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate hint' },
      { status: 500 }
    );
  }
}