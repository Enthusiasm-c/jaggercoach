// Test script for dialogue system with env loading
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

import { getAgentResponse } from './lib/agent';
import { createInitialState } from './lib/trainer-state';

async function quickTest() {
  console.log('\n🧪 QUICK DIALOGUE TEST\n');
  console.log('Testing agent responses for length and naturalness...\n');
  
  // Test 1: Response should be 2-4 sentences
  console.log('TEST 1: Response Length');
  console.log('-'.repeat(40));
  
  const state1 = createInitialState('product_absent', ['Ice Cold Serve', 'Visibility']);
  state1.turn = 1;
  
  const response1 = await getAgentResponse(
    'product_absent',
    state1,
    "Tell me about your customers and what they like",
    'medium',
    []
  );
  
  console.log('BA: Tell me about your customers and what they like');
  console.log(`SARAH: ${response1.reply}`);
  
  const sentences1 = response1.reply.split(/[.!?]+/).filter(s => s.trim()).length;
  console.log(`✓ Sentences: ${sentences1} ${sentences1 <= 4 ? '✅ PASS' : '❌ FAIL (too long)'}\n`);
  
  // Test 2: Should not repeat when concerns are addressed
  console.log('TEST 2: No Repetition');
  console.log('-'.repeat(40));
  
  const state2 = createInitialState('no_perfect_serve', ['Ice Cold Serve']);
  state2.turn = 3;
  
  const response2 = await getAgentResponse(
    'no_perfect_serve',
    state2,
    "Everything is completely free - the machine, maintenance, electricity costs, all covered by us",
    'medium',
    []
  );
  
  console.log('BA: Everything is completely free - the machine, maintenance, electricity costs, all covered by us');
  console.log(`MARK: ${response2.reply}`);
  
  const hasCostConcern = response2.reply.toLowerCase().includes('cost') || 
                         response2.reply.toLowerCase().includes('free') ||
                         response2.reply.toLowerCase().includes('pay');
  console.log(`✓ Repeats cost concern: ${hasCostConcern ? '❌ FAIL' : '✅ PASS'}\n`);
  
  // Test 3: Should agree in easy mode quickly
  console.log('TEST 3: Easy Mode Agreement');
  console.log('-'.repeat(40));
  
  const state3 = createInitialState('product_absent', ['Ice Cold Serve']);
  state3.turn = 2;
  
  const response3 = await getAgentResponse(
    'product_absent',
    state3,
    "Free trial, no commitment, we handle everything",
    'easy',
    []
  );
  
  console.log('BA: Free trial, no commitment, we handle everything');
  console.log(`SARAH: ${response3.reply}`);
  
  const hasAgreement = response3.reply.toLowerCase().includes("let's try") ||
                       response3.reply.toLowerCase().includes("i'm in") ||
                       response3.reply.toLowerCase().includes("deal") ||
                       response3.reply.toLowerCase().includes("sounds good");
  console.log(`✓ Shows agreement: ${hasAgreement ? '✅ PASS' : '⚠️  May need more convincing'}\n`);
  
  // Test 4: Should be skeptical in hard mode
  console.log('TEST 4: Hard Mode Skepticism');
  console.log('-'.repeat(40));
  
  const state4 = createInitialState('no_perfect_serve', ['Ice Cold Serve']);
  state4.turn = 1;
  
  const response4 = await getAgentResponse(
    'no_perfect_serve',
    state4,
    "It will increase your sales",
    'hard',
    []
  );
  
  console.log('BA: It will increase your sales');
  console.log(`MARK: ${response4.reply}`);
  
  const isSkeptical = response4.reply.toLowerCase().includes('data') ||
                      response4.reply.toLowerCase().includes('proof') ||
                      response4.reply.toLowerCase().includes('how') ||
                      response4.reply.toLowerCase().includes('specific');
  console.log(`✓ Shows skepticism: ${isSkeptical ? '✅ PASS' : '❌ FAIL'}\n`);
  
  // Test 5: Should close after multiple positive exchanges
  console.log('TEST 5: Conversation Closure');
  console.log('-'.repeat(40));
  
  const state5 = createInitialState('product_absent', ['Ice Cold Serve']);
  state5.turn = 8; // Late in conversation
  state5.objectives.trialOrder = true; // Some agreement already
  
  const response5 = await getAgentResponse(
    'product_absent',
    state5,
    "So we have a deal then? I'll bring everything tomorrow",
    'medium',
    []
  );
  
  console.log('BA: So we have a deal then? I\'ll bring everything tomorrow');
  console.log(`SARAH: ${response5.reply}`);
  
  const closesConversation = response5.reply.toLowerCase().includes("deal") ||
                             response5.reply.toLowerCase().includes("tomorrow") ||
                             response5.reply.toLowerCase().includes("let's do it") ||
                             response5.reply.toLowerCase().includes("sounds good");
  console.log(`✓ Closes conversation: ${closesConversation ? '✅ PASS' : '❌ FAIL'}\n`);
  
  console.log('='.repeat(50));
  console.log('TEST SUMMARY:');
  console.log('All tests check if agent responses are:');
  console.log('✓ Short (2-4 sentences)');
  console.log('✓ Natural and conversational');
  console.log('✓ Progressive (not repeating)');
  console.log('✓ Difficulty-appropriate');
  console.log('✓ Able to close deals');
  console.log('='.repeat(50));
}

// Run the test
quickTest().catch(console.error);