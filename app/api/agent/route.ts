import { NextRequest, NextResponse } from 'next/server';
import { agentPipeline } from '@/lib/agent-pipeline';
import { initialMemory, Memory } from '@/lib/memory-system';
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

export async function POST(req: NextRequest) {
  try {
    const { scenarioId, memory, lastTurn } = await req.json();

    let currentMemory: Memory;

    if (memory) {
      currentMemory = memory;
    } else {
      const scenario = getScenario(scenarioId);
      if (!scenario) {
        return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
      }
      currentMemory = initialMemory(scenario);
    }

    const result = await agentPipeline(currentMemory, lastTurn);

    // The response should include the new memory state so the client can send it back next time.
    return NextResponse.json({
        reply: result.reply,
        memory: result.newMemory,
        // for debugging and logging
        plan: result.plan,
        criticResponse: result.criticResponse,
    });

  } catch (error) {
    console.error('Agent error:', error);
    return NextResponse.json(
      { error: 'Failed to generate agent response' },
      { status: 500 }
    );
  }
}