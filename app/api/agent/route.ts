import { NextRequest, NextResponse } from 'next/server';
import { getAgentResponse } from '@/lib/agent';

export async function POST(req: NextRequest) {
  try {
    const { scenarioId, state, lastTurn, difficulty = 'medium', conversationHistory = [] } = await req.json();
    
    const result = await getAgentResponse(scenarioId, state, lastTurn, difficulty, conversationHistory);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Agent error:', error);
    return NextResponse.json(
      { error: 'Failed to generate agent response' },
      { status: 500 }
    );
  }
}