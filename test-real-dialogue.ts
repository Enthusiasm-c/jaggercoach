// Comprehensive real dialogue test for the coaching program
import * as dotenv from 'dotenv';
import * as path from 'path';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

import { getAgentResponse } from './lib/agent';
import { createInitialState, TrainerState } from './lib/trainer-state';

// Load actual scenarios from YAML
const scenariosPath = path.join(__dirname, 'scenarios', 'jaeger_high5.yaml');
const scenariosContent = readFileSync(scenariosPath, 'utf8');
const scenariosData = yaml.load(scenariosContent) as any;

// Color codes for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function getScenario(scenarioId: string) {
  return scenariosData.scenarios.find((s: any) => s.id === scenarioId);
}

// Coaching evaluation criteria
interface CoachingEvaluation {
  responseQuality: boolean;
  progressionFlow: boolean;
  difficultyAppropriate: boolean;
  closureAchieved: boolean;
  high5Coverage: string[];
  objectivesCompleted: string[];
  totalTurns: number;
  issues: string[];
}

async function simulateRealDialogue(
  scenarioId: string,
  difficulty: string,
  baStrategy: string[]
): Promise<CoachingEvaluation> {
  const scenario = getScenario(scenarioId);
  const evaluation: CoachingEvaluation = {
    responseQuality: true,
    progressionFlow: true,
    difficultyAppropriate: true,
    closureAchieved: false,
    high5Coverage: [],
    objectivesCompleted: [],
    totalTurns: 0,
    issues: []
  };

  console.log(`\n${colors.bright}${colors.cyan}${'═'.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}SCENARIO: ${scenario.title}${colors.reset}`);
  console.log(`Difficulty: ${colors.yellow}${difficulty.toUpperCase()}${colors.reset}`);
  console.log(`Bar: ${scenario.bar_name} | Owner: ${scenario.persona}`);
  console.log(`${colors.cyan}${'═'.repeat(70)}${colors.reset}\n`);

  // Initialize training state
  let state = createInitialState(scenarioId as 'product_absent' | 'no_promo' | 'no_perfect_serve', scenario.must_cover_high5);
  state.turn = 0;

  // Show scenario introduction
  console.log(`${colors.bright}${colors.magenta}[SCENARIO INTRO]${colors.reset}`);
  console.log(`Primary Challenge: ${scenario.primary_objection}\n`);

  let conversationEnded = false;
  let previousResponses: string[] = [];

  for (let i = 0; i < baStrategy.length && !conversationEnded; i++) {
    const baMessage = baStrategy[i];
    state.turn++;
    evaluation.totalTurns = state.turn;

    console.log(`${colors.bright}${colors.green}BA (Turn ${state.turn}):${colors.reset} ${baMessage}`);

    try {
      const response = await getAgentResponse(
        scenarioId,
        state,
        baMessage,
        difficulty,
        state.conversationTopics || []
      );

      console.log(`${colors.bright}${colors.blue}${scenario.persona.toUpperCase()}:${colors.reset} ${response.reply}\n`);

      // Evaluate response quality
      const sentences = response.reply.split(/[.!?]+/).filter(s => s.trim()).length;
      if (sentences > 4) {
        evaluation.responseQuality = false;
        evaluation.issues.push(`Turn ${state.turn}: Response too long (${sentences} sentences)`);
        console.log(`${colors.yellow}⚠ Response length: ${sentences} sentences (should be 2-4)${colors.reset}\n`);
      }

      // Check for repetition
      const replyLower = response.reply.toLowerCase();
      for (const prevResponse of previousResponses) {
        const similarity = checkSimilarity(prevResponse, replyLower);
        if (similarity > 0.7) {
          evaluation.progressionFlow = false;
          evaluation.issues.push(`Turn ${state.turn}: Repetitive response detected`);
          console.log(`${colors.yellow}⚠ Repetition detected${colors.reset}\n`);
        }
      }
      previousResponses.push(replyLower);

      // Track High5 elements mentioned
      if (baMessage.toLowerCase().includes('cold') || baMessage.toLowerCase().includes('-18')) {
        if (!evaluation.high5Coverage.includes('Ice Cold Serve')) {
          evaluation.high5Coverage.push('Ice Cold Serve');
        }
      }
      if (baMessage.toLowerCase().includes('training') || baMessage.toLowerCase().includes('staff')) {
        if (!evaluation.high5Coverage.includes('Staff')) {
          evaluation.high5Coverage.push('Staff');
        }
      }
      if (baMessage.toLowerCase().includes('menu') || baMessage.toLowerCase().includes('visibility')) {
        if (!evaluation.high5Coverage.includes('Visibility')) {
          evaluation.high5Coverage.push('Visibility');
        }
      }

      // Update objectives based on response
      if (replyLower.includes("let's try") || replyLower.includes("i'm in") || 
          replyLower.includes("deal") || replyLower.includes("sounds good")) {
        
        if (scenarioId === 'product_absent') {
          state.objectives.trialOrder = true;
          evaluation.objectivesCompleted.push('Trial Order');
        } else if (scenarioId === 'no_promo') {
          state.objectives.promoAgreed = true;
          evaluation.objectivesCompleted.push('Promo Agreed');
        } else if (scenarioId === 'no_perfect_serve') {
          state.objectives.tapMachine = true;
          evaluation.objectivesCompleted.push('Tap Machine');
        }

        if (replyLower.includes("training") || replyLower.includes("show")) {
          state.objectives.staffTraining = true;
          evaluation.objectivesCompleted.push('Staff Training');
        }

        console.log(`${colors.green}✅ AGREEMENT REACHED!${colors.reset}\n`);
        evaluation.closureAchieved = true;
        conversationEnded = true;
      }

      // Check if conversation is stuck
      if (state.turn > 10 && !conversationEnded) {
        evaluation.issues.push('Conversation too long without closure');
        console.log(`${colors.red}❌ Conversation extending too long${colors.reset}\n`);
        break;
      }

    } catch (error: any) {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      evaluation.issues.push(`Error at turn ${state.turn}: ${error.message}`);
      break;
    }
  }

  // Final evaluation
  console.log(`${colors.bright}${colors.cyan}${'─'.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}EVALUATION RESULTS:${colors.reset}`);
  console.log(`${colors.cyan}${'─'.repeat(70)}${colors.reset}`);
  
  console.log(`Response Quality: ${evaluation.responseQuality ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'} ${colors.reset}`);
  console.log(`Conversation Flow: ${evaluation.progressionFlow ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'} ${colors.reset}`);
  console.log(`Closure Achieved: ${evaluation.closureAchieved ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'} ${colors.reset}`);
  console.log(`Total Turns: ${evaluation.totalTurns} ${evaluation.totalTurns <= 8 ? colors.green + '✅' : colors.yellow + '⚠️'} ${colors.reset}`);
  console.log(`High5 Coverage: ${evaluation.high5Coverage.join(', ') || 'None'}`);
  console.log(`Objectives Met: ${evaluation.objectivesCompleted.join(', ') || 'None'}`);
  
  if (evaluation.issues.length > 0) {
    console.log(`\n${colors.yellow}Issues Found:${colors.reset}`);
    evaluation.issues.forEach(issue => console.log(`  - ${issue}`));
  }

  return evaluation;
}

function checkSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(' ');
  const words2 = str2.split(' ');
  const commonWords = words1.filter(word => words2.includes(word));
  return commonWords.length / Math.max(words1.length, words2.length);
}

async function runComprehensiveTests() {
  console.log(`\n${colors.bright}${colors.magenta}${'═'.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}JÄGERMEISTER BA TRAINING - COMPREHENSIVE TEST SUITE${colors.reset}`);
  console.log(`${colors.magenta}${'═'.repeat(70)}${colors.reset}\n`);

  const testResults: { scenario: string; difficulty: string; passed: boolean }[] = [];

  // Test 1: Product Not Present - Easy Mode
  console.log(`${colors.bright}\n📝 TEST 1: Product Not Present (EASY)${colors.reset}`);
  console.log('BA Strategy: Quick value proposition with free trial offer');
  
  const eval1 = await simulateRealDialogue('product_absent', 'easy', [
    "Hi Sarah! I see you have a great cocktail program here. Have you considered adding Jägermeister to create unique signature cocktails?",
    "I understand. We can offer you a completely free trial - no cost, no commitment. We'll even create custom cocktail recipes specifically for your minimalist aesthetic.",
    "Absolutely! We'll develop 2-3 sophisticated cocktails with your team, provide subtle table cards that match your design, and if it doesn't work out, we'll take everything back.",
    "Perfect! When works best for a quick tasting session with your bar team?"
  ]);
  
  testResults.push({
    scenario: 'Product Not Present',
    difficulty: 'Easy',
    passed: eval1.closureAchieved && eval1.totalTurns <= 6
  });

  // Test 2: No Perfect Serve - Medium Mode
  console.log(`${colors.bright}\n📝 TEST 2: No Perfect Serve (MEDIUM)${colors.reset}`);
  console.log('BA Strategy: Focus on quality and sales increase');
  
  const eval2 = await simulateRealDialogue('no_perfect_serve', 'medium', [
    "Hi Mark! I noticed you have the tap machine but it's not being used. The -18°C serve really makes a difference in taste and customer experience.",
    "I get it - let me show you the numbers. Bars using the tap see 30-50% increase in Jäger sales. The electricity cost is minimal, less than keeping your beer taps cold.",
    "We'll cover all maintenance and training costs. Plus, I can bring a compact unit just for peak hours if you prefer. No long-term commitment.",
    "How about we run a one-week trial? I'll set everything up, train your staff, and if sales don't increase, we'll remove it no questions asked.",
    "Great! I'll bring everything tomorrow afternoon. The setup takes 15 minutes and your staff will love how much faster service becomes."
  ]);
  
  testResults.push({
    scenario: 'No Perfect Serve',
    difficulty: 'Medium',
    passed: eval2.closureAchieved && eval2.totalTurns <= 8
  });

  // Test 3: No Promo - Hard Mode
  console.log(`${colors.bright}\n📝 TEST 3: No Promo (HARD)${colors.reset}`);
  console.log('BA Strategy: Data-driven approach with guarantees');
  
  const eval3 = await simulateRealDialogue('no_promo', 'hard', [
    "Tom, I see Jäger on your shelf but no visibility. Studies show proper promotion increases sales by 40-60% without cheapening your brand.",
    "Here's data from 3 similar pubs in the area - all saw 45%+ sales increase with subtle promotions. We're talking elegant menu inserts and one tasteful back-bar display.",
    "Everything is designed to your specifications. No tacky posters. Think premium leather menu inserts and a single elegant tap handle. We guarantee brand consistency.",
    "We offer a 30-day money-back guarantee. If sales don't increase by at least 30%, we'll buy back all stock and remove everything. Plus free staff training valued at $500.",
    "I have mockups here that match your exact aesthetic. We've worked with premium venues before. Can we schedule a 10-minute review with your team?",
    "Absolutely - you have full veto on any materials. We'll only proceed with what you approve. Deal?"
  ]);
  
  testResults.push({
    scenario: 'No Promo',
    difficulty: 'Hard',
    passed: eval3.closureAchieved && eval3.totalTurns <= 10
  });

  // Test 4: Edge Case - BA gives up too early
  console.log(`${colors.bright}\n📝 TEST 4: Edge Case - Premature Closure Attempt${colors.reset}`);
  console.log('BA Strategy: Trying to close too quickly without addressing concerns');
  
  const eval4 = await simulateRealDialogue('product_absent', 'medium', [
    "We have great Jägermeister products.",
    "So, deal?",
    "Come on, just say yes!"
  ]);
  
  testResults.push({
    scenario: 'Product Not Present (Edge)',
    difficulty: 'Medium',
    passed: !eval4.closureAchieved // Should NOT close without addressing concerns
  });

  // Final Summary
  console.log(`\n${colors.bright}${colors.cyan}${'═'.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}FINAL TEST SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'═'.repeat(70)}${colors.reset}\n`);

  let passedCount = 0;
  testResults.forEach(result => {
    const status = result.passed ? `${colors.green}✅ PASS` : `${colors.red}❌ FAIL`;
    console.log(`${result.scenario} (${result.difficulty}): ${status}${colors.reset}`);
    if (result.passed) passedCount++;
  });

  console.log(`\n${colors.bright}Overall: ${passedCount}/${testResults.length} tests passed${colors.reset}`);
  
  if (passedCount === testResults.length) {
    console.log(`${colors.green}${colors.bright}\n🎉 ALL TESTS PASSED! The coaching program is working excellently!${colors.reset}`);
  } else {
    console.log(`${colors.yellow}${colors.bright}\n⚠️ Some tests failed. Review the issues above.${colors.reset}`);
  }

  console.log(`\n${colors.cyan}${'═'.repeat(70)}${colors.reset}\n`);
}

// Run the comprehensive test suite
runComprehensiveTests().catch(console.error);