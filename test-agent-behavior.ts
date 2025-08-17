// Test script to verify agent answers questions instead of leading
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

import { getAgentResponse } from './lib/agent';
import { createInitialState } from './lib/trainer-state';

async function testAgentBehavior() {
  console.log('\n🧪 TESTING AGENT BEHAVIOR - Should Answer, Not Lead\n');
  console.log('=' .repeat(60));
  
  // Test 1: When BA asks about promos
  console.log('\nTEST 1: BA asks "What promos do you currently run?"');
  console.log('-'.repeat(40));
  
  const state1 = createInitialState('no_promo', ['Visibility']);
  state1.turn = 2;
  
  const response1 = await getAgentResponse(
    'no_promo',
    state1,
    "What promos do you currently run?",
    'medium',
    []
  );
  
  console.log('BA: What promos do you currently run?');
  console.log(`TOM: ${response1.reply}\n`);
  
  // Count questions in response
  const questions1 = (response1.reply.match(/\?/g) || []).length;
  console.log(`Questions asked by Tom: ${questions1}`);
  console.log(`✓ Result: ${questions1 <= 1 ? '✅ PASS (0-1 questions ok)' : '❌ FAIL (too many questions)'}\n`);
  
  // Test 2: When BA makes a statement about pricing
  console.log('TEST 2: BA says "Everything will be completely free"');
  console.log('-'.repeat(40));
  
  const state2 = createInitialState('no_perfect_serve', ['Ice Cold Serve']);
  state2.turn = 3;
  
  const response2 = await getAgentResponse(
    'no_perfect_serve',
    state2,
    "Everything will be completely free - machine, maintenance, electricity, all covered by us",
    'medium',
    []
  );
  
  console.log('BA: Everything will be completely free - machine, maintenance, electricity, all covered by us');
  console.log(`MARK: ${response2.reply}\n`);
  
  const questions2 = (response2.reply.match(/\?/g) || []).length;
  console.log(`Questions asked by Mark: ${questions2}`);
  console.log(`✓ Result: ${questions2 <= 1 ? '✅ PASS (0-1 questions ok)' : '❌ FAIL (too many questions)'}\n`);
  
  // Test 3: Direct question that needs direct answer
  console.log('TEST 3: BA asks "How many customers do you get on weekends?"');
  console.log('-'.repeat(40));
  
  const state3 = createInitialState('product_absent', ['Ice Cold Serve']);
  state3.turn = 2;
  
  const response3 = await getAgentResponse(
    'product_absent',
    state3,
    "How many customers do you typically get on weekends?",
    'medium',
    []
  );
  
  console.log('BA: How many customers do you typically get on weekends?');
  console.log(`SARAH: ${response3.reply}\n`);
  
  // Check if response starts with an answer (not a question)
  const startsWithAnswer = !response3.reply.trim().startsWith('What') && 
                           !response3.reply.trim().startsWith('How') &&
                           !response3.reply.trim().startsWith('Why');
  const questions3 = (response3.reply.match(/\?/g) || []).length;
  
  console.log(`Starts with answer: ${startsWithAnswer ? '✅' : '❌'}`);
  console.log(`Questions asked: ${questions3}`);
  console.log(`✓ Result: ${startsWithAnswer && questions3 <= 1 ? '✅ PASS' : '❌ FAIL'}\n`);
  
  // Test 4: Hard mode - should still answer first
  console.log('TEST 4: Hard mode - BA asks about current setup');
  console.log('-'.repeat(40));
  
  const state4 = createInitialState('no_promo', ['Visibility']);
  state4.turn = 1;
  
  const response4 = await getAgentResponse(
    'no_promo',
    state4,
    "Tell me about your current promotional activities",
    'hard',
    []
  );
  
  console.log('BA: Tell me about your current promotional activities');
  console.log(`TOM: ${response4.reply}\n`);
  
  const questions4 = (response4.reply.match(/\?/g) || []).length;
  const startsWithAnswer4 = response4.reply.toLowerCase().includes('we ') || 
                            response4.reply.toLowerCase().includes('our ') ||
                            response4.reply.toLowerCase().includes('i ');
  
  console.log(`Answers the question: ${startsWithAnswer4 ? '✅' : '❌'}`);
  console.log(`Questions asked: ${questions4}`);
  console.log(`✓ Result: ${startsWithAnswer4 ? '✅ PASS' : '❌ FAIL'}\n`);
  
  console.log('=' .repeat(60));
  console.log('SUMMARY:');
  console.log('Agents should:');
  console.log('✓ Answer questions directly when asked');
  console.log('✓ Not ask multiple questions in response');
  console.log('✓ Express concerns naturally, not interrogate');
  console.log('✓ Let the BA lead the conversation');
  console.log('=' .repeat(60));
}

// Run the test
testAgentBehavior().catch(console.error);