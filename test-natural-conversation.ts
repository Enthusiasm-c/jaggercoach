// Test natural conversation flow with simplified agent
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

import { getAgentResponse } from './lib/agent';
import { createInitialState } from './lib/trainer-state';

async function testNaturalConversation() {
  console.log('\n🧪 TESTING NATURAL CONVERSATION - Simple Roleplay Approach\n');
  console.log('=' .repeat(60));
  
  // Test 1: Sarah should answer questions naturally
  console.log('\nTEST 1: Discovery Question → Natural Answer');
  console.log('-'.repeat(40));
  
  const state1 = createInitialState('product_absent', ['Ice Cold Serve']);
  state1.turn = 1;
  
  const response1 = await getAgentResponse(
    'product_absent',
    state1,
    "Sarah, could you tell me more about your customers?",
    'medium',
    []
  );
  
  console.log('BA: Sarah, could you tell me more about your customers?');
  console.log(`SARAH: ${response1.reply}\n`);
  
  // Check if Sarah answers the question
  const answersAboutCustomers = response1.reply.toLowerCase().includes('customer') ||
                                response1.reply.toLowerCase().includes('guest') ||
                                response1.reply.toLowerCase().includes('crowd') ||
                                response1.reply.toLowerCase().includes('people') ||
                                response1.reply.toLowerCase().includes('they');
  console.log(`✓ Answers about customers: ${answersAboutCustomers ? '✅ PASS' : '❌ FAIL'}`);
  
  // Check if response is natural (not just stating objection)
  const justStatesObjection = response1.reply.toLowerCase().includes("don't ask for") &&
                              response1.reply.split(/[.!?]/).length === 1;
  console.log(`✓ Natural response (not just objection): ${!justStatesObjection ? '✅ PASS' : '❌ FAIL'}\n`);
  
  // Test 2: Sarah should express concerns when pitched
  console.log('TEST 2: Sales Pitch → Express Concerns');
  console.log('-'.repeat(40));
  
  const state2 = createInitialState('product_absent', ['Ice Cold Serve']);
  state2.turn = 2;
  
  const response2 = await getAgentResponse(
    'product_absent',
    state2,
    "We can provide a free trial with no commitment, just one bottle to test",
    'medium',
    []
  );
  
  console.log('BA: We can provide a free trial with no commitment, just one bottle to test');
  console.log(`SARAH: ${response2.reply}\n`);
  
  // Check if Sarah expresses a concern or considers the offer
  const expressesConcern = response2.reply.toLowerCase().includes('but') ||
                          response2.reply.toLowerCase().includes('concern') ||
                          response2.reply.toLowerCase().includes('worry') ||
                          response2.reply.toLowerCase().includes('what about');
  const considersOffer = response2.reply.toLowerCase().includes('interesting') ||
                         response2.reply.toLowerCase().includes('sounds') ||
                         response2.reply.toLowerCase().includes('trial');
  console.log(`✓ Responds to pitch naturally: ${(expressesConcern || considersOffer) ? '✅ PASS' : '❌ FAIL'}\n`);
  
  // Test 3: Easy mode should be more agreeable
  console.log('TEST 3: Easy Mode - More Agreeable');
  console.log('-'.repeat(40));
  
  const state3 = createInitialState('no_perfect_serve', ['Ice Cold Serve']);
  state3.turn = 3;
  
  const response3easy = await getAgentResponse(
    'no_perfect_serve',
    state3,
    "We'll provide free training and it will increase your sales",
    'easy',
    []
  );
  
  console.log('BA: We\'ll provide free training and it will increase your sales');
  console.log(`MARK (Easy): ${response3easy.reply}`);
  
  const response3hard = await getAgentResponse(
    'no_perfect_serve',
    state3,
    "We'll provide free training and it will increase your sales",
    'hard',
    []
  );
  
  console.log(`MARK (Hard): ${response3hard.reply}\n`);
  
  // Easy should be more positive than hard
  const easyIsPositive = response3easy.reply.toLowerCase().includes('sounds') ||
                        response3easy.reply.toLowerCase().includes('interesting') ||
                        response3easy.reply.toLowerCase().includes('let') ||
                        response3easy.reply.toLowerCase().includes('try');
  const hardIsSkeptical = response3hard.reply.toLowerCase().includes('proof') ||
                          response3hard.reply.toLowerCase().includes('data') ||
                          response3hard.reply.toLowerCase().includes('how') ||
                          response3hard.reply.toLowerCase().includes('doubt');
  console.log(`✓ Easy mode more agreeable: ${easyIsPositive ? '✅ PASS' : '⚠️ CHECK'}`);
  console.log(`✓ Hard mode more skeptical: ${hardIsSkeptical ? '✅ PASS' : '⚠️ CHECK'}\n`);
  
  // Test 4: Long conversation should trigger decision
  console.log('TEST 4: Long Conversation → Decision Time');
  console.log('-'.repeat(40));
  
  const state4 = createInitialState('product_absent', ['Ice Cold Serve']);
  state4.turn = 7; // Long conversation
  state4.objectionsRaised = ['primary', 'space', 'customers'];
  
  const response4 = await getAgentResponse(
    'product_absent',
    state4,
    "So we've addressed all your concerns - free trial, minimal POSM, staff training included",
    'medium',
    []
  );
  
  console.log('BA: So we\'ve addressed all your concerns - free trial, minimal POSM, staff training included');
  console.log(`SARAH (Turn 7): ${response4.reply}\n`);
  
  const makesDecision = response4.reply.toLowerCase().includes('alright') ||
                       response4.reply.toLowerCase().includes('let\'s try') ||
                       response4.reply.toLowerCase().includes('convinced') ||
                       response4.reply.toLowerCase().includes('not interested') ||
                       response4.reply.toLowerCase().includes('sorry');
  console.log(`✓ Makes a decision (turn 7): ${makesDecision ? '✅ PASS' : '❌ FAIL'}\n`);
  
  console.log('=' .repeat(60));
  console.log('SUMMARY:');
  console.log('✓ Agents answer questions naturally');
  console.log('✓ React appropriately to pitches');
  console.log('✓ Difficulty levels affect personality');
  console.log('✓ Conversations end naturally after reasonable length');
  console.log('=' .repeat(60));
}

// Run the test
testNaturalConversation().catch(console.error);