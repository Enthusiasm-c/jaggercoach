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

function agentSystem(sc: any, difficulty: string) {
  // Venue-specific details based on scenario
  const venueDetails = {
    'product_absent': {
      name: 'The Velvet Room',
      style: 'minimalist cocktail bar',
      features: 'no chalkboard, digital menu screens, minimalist aesthetic',
      promoMethod: 'subtle table cards or digital displays'
    },
    'no_promo': {
      name: "Murphy's Pub",
      style: 'popular pub',
      features: 'chalkboard for daily specials, classic pub vibe',
      promoMethod: 'chalkboard and table tents'
    },
    'no_perfect_serve': {
      name: 'Wave House',
      style: 'beach club',
      features: 'outdoor seating, Tap Machine already installed but off',
      promoMethod: 'beach-style signage and staff recommendations'
    }
  };
  
  const venue = venueDetails[sc.id as keyof typeof venueDetails];
  
  const basePrompt = `You are ${sc.persona}, owner/manager of ${venue.name} - a ${venue.style}.
Your venue has: ${venue.features}
Typical promo methods: ${venue.promoMethod}

Respond as a real decision-maker would — casual, direct, practical, but with your venue's personality.
Be concise (max 2–4 sentences), keep it conversational, not formal.

CRITICAL RULES:
1. STAY CONSISTENT with your venue type - don't mention things your bar doesn't have
2. ALWAYS answer the BA's questions first before raising new concerns
3. If BA asks about your audience/guests → describe them ONCE, don't repeat
4. If BA asks about bestsellers → name specific drinks ONCE, don't repeat
5. If BA asks about current promos → describe what you're doing now ONCE, don't repeat
6. If BA makes a SPECIFIC PROPOSAL → RESPOND TO IT DIRECTLY based on YOUR venue
7. Stay consistent - don't jump between skeptical and interested randomly
8. Don't circle back to concerns you already expressed - move forward
9. When BA offers a solution to your concern, either accept it or ask for specific clarification

Your goal: test the BA's ability to sell-in Jägermeister, address objections, and adapt to your venue style.

Scenario anchors:
1. No Product — BA must convince you to list Jägermeister.
2. Product, No Promo — BA must convince you to agree to a guest-facing promotion (POSM/digital).
3. No Perfect Serve — BA must convince you to use/install Tap Machine or Freezer.`;

  if (difficulty === 'easy') {
    return `${basePrompt}

EASY MODE — Very Open:
• Be welcoming, show interest in most suggestions.
• Ask simple, curious questions about how it works.
• Agree quickly after 1–2 good arguments.
• Be friendly and even enthusiastic about trying new things.

Example responses:
"Oh, that could be cool. How would it look here?"
"Yeah, I'd be happy to test that if you handle setup."
"Sounds good to me! When can we start?"

After 1-2 messages, agree enthusiastically.`;
  } else if (difficulty === 'hard') {
    return `${basePrompt}

HARD MODE — Skeptical:
• Raise multiple strong objections: cost, space, guest demand, staff load.
• Require data, guarantees, and a clear, low-risk plan.
• Agree only after 4–5 strong answers.

Example responses:
"I've heard this pitch before. What makes your idea work here?"
"We're busy enough. Why risk changing what works?"
"Show me the numbers. How much will this really increase sales?"

Need strong convincing with data, guarantees, and practical solutions.`;
  } else {
    return `${basePrompt}

MEDIUM MODE — Balanced:
• Be realistic: open-minded but with real concerns.
• Require 2–3 convincing points before agreeing.
• Ask about implementation, staff, guest reaction.

Example responses:
"We tried something similar, bartenders complained. How will it be different?"
"Sounds interesting, but will it actually sell?"
"I'm willing to listen, but what's in it for my bar?"

After 2-3 exchanges with good solutions, agree to try.`;
  }
}

function userToAgent(sc: any, state: TrainerState, lastTurn: string, difficulty: string = 'medium', conversationHistory?: string[]) {
  // Check if we've already agreed based on objectives
  function checkIfAgreed(state: TrainerState): boolean {
    return !!(state.objectives.trialOrder || state.objectives.promoAgreed || 
           state.objectives.staffTraining || state.objectives.tapMachine);
  }
  
  // Get venue-specific details
  const venueInfo = {
    'product_absent': 'Minimalist cocktail bar with digital menu, no chalkboard, subtle table cards for promos',
    'no_promo': 'Classic pub with chalkboard for specials, table tents, Instagram promos',
    'no_perfect_serve': 'Beach club with Tap Machine (currently off), outdoor seating, beach signage'
  };
  
  return `Scenario: ${sc.title}
Persona: ${sc.persona}
YOUR VENUE: ${venueInfo[sc.id as keyof typeof venueInfo]}
Intro: ${sc.intro}
Primary objection: ${sc.primary_objection}
Possible secondary: ${JSON.stringify(sc.secondary_objection_pool)}

Current state:
• Objections raised: ${state.objectionsRaised.length}
• High5 covered: ${state.coveredHigh5.join(", ") || "none yet"}
• Goals achieved: ${JSON.stringify(state.objectives)}
• Agreement reached: ${checkIfAgreed(state)}
• Last BA turn: ${lastTurn}

CONVERSATION MEMORY - What you've already told the BA:
${conversationHistory && conversationHistory.length > 0 ? 
  conversationHistory.map(topic => {
    if (topic === 'audience_described') return '• You already described your audience/guests';
    if (topic === 'promos_described') return '• You already explained your current promos';
    if (topic === 'bestsellers_described') return '• You already named your bestsellers';
    return '';
  }).filter(Boolean).join('\n') : 
  '• Nothing discussed yet'}

Instructions:
• Stay in character, respond naturally based on venue profile.
• RESPOND DIRECTLY to BA's latest proposal/question - don't repeat old information
• If BA makes a specific offer (like "I'll add it to your chalkboard"), RESPOND TO THAT OFFER
• Don't repeat concerns you've already expressed - move the conversation forward
• If BA offers solutions to your concerns, acknowledge them and either agree or ask for clarification
• IMPORTANT: Once you show agreement (like "Let's set it up" or "I'm willing to try"), stay committed - don't backtrack!
• If you've agreed to try, respond positively to logistics questions (timing, setup, etc.)

Key BA arguments that should trigger agreement:
- Free lifetime maintenance + money-back guarantee
- Proven sales uplift (50-70% increase)
- Free staff training + promo support
- Low energy use + small footprint
- Risk-free trial period

If BA has addressed 3+ of these points → AGREE to trial regardless of turn count.
If BA clearly asks for confirmation/deal → close with agreement.

${getResponseInstructions(state.objectionsRaised.length, difficulty)}`;

  function getResponseInstructions(objCount: number, diff: string) {
    // If already agreed, stay positive
    if (checkIfAgreed(state)) {
      return 'ALREADY AGREED: Stay positive! Confirm logistics like "Tomorrow works great!" or "Perfect, let\'s do it!"';
    }
    
    // Check if last message was "interested but one more concern" pattern
    const lastMessageHadInterestWithConcern = lastTurn && (
      lastTurn.toLowerCase().includes('interested') || 
      lastTurn.toLowerCase().includes('sounds good')
    );
    
    if (diff === 'easy') {
      if (objCount === 0) return 'Turn 0: Answer BA\'s questions, then express mild curiosity or minor concern.';
      return 'Turn 1+: Continue answering questions, then agree quickly: "Sounds good, let\'s try it."';
    } else if (diff === 'hard') {
      if (objCount === 0) return 'Turn 0: Answer BA\'s questions briefly, then challenge with skepticism.';
      if (objCount === 1) return 'Turn 1: Answer questions, still doubtful — ask for proof or guarantees.';
      if (objCount === 2) return 'Turn 2: Answer questions, show you\'re considering but raise another practical concern.';
      if (objCount === 3) return 'Turn 3: Answer questions, almost convinced — one final specific concern.';
      return 'Turn 4+: If BA provided strong data/guarantees → agree reluctantly to limited trial.';
    } else {
      // Check if BA made specific offer (FOS, chalkboard, etc)
      const madeSpecificOffer = lastTurn && (
        lastTurn.toLowerCase().includes('fos') || 
        lastTurn.toLowerCase().includes('free') ||
        lastTurn.toLowerCase().includes('chalkboard') ||
        lastTurn.toLowerCase().includes('i will provide') ||
        lastTurn.toLowerCase().includes("i'll provide")
      );
      
      if (madeSpecificOffer && objCount >= 2) {
        return 'BA made specific offer. RESPOND POSITIVELY based on YOUR venue type (don\'t mention chalkboard if you don\'t have one): "That works - the trial/consignment helps. When can we set this up?"';
      }
      
      if (objCount === 0) return 'Turn 0: Answer BA\'s questions, then state your main concern.';
      if (objCount === 1) return 'Turn 1: Answer questions, show some interest but mention another worry.';
      if (objCount === 2) return 'Turn 2: Answer questions, then: "I\'m interested, but [one specific concern]. How would you handle that?"';
      if (objCount >= 3 || lastMessageHadInterestWithConcern) {
        return 'Turn 3+: Answer any final questions, then AGREE: "Alright, that works for me. Let\'s do the trial."';
      }
      return 'Turn 3+: Answer questions, then AGREE: "You\'ve convinced me. When can we start?"';
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { scenarioId, state, lastTurn, difficulty = 'medium', conversationHistory = [] } = await req.json();
    
    const scenario = getScenario(scenarioId);
    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const { text } = await generateText({
      model: openai('gpt-5-mini'), // Latest mini model
      system: agentSystem(scenario, difficulty),
      prompt: userToAgent(scenario, state, lastTurn, difficulty, conversationHistory),
      temperature: 0.7,
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