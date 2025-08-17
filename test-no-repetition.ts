// Test to verify agents don't repeat addressed concerns
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

import { getAgentResponse } from './lib/agent';
import { createInitialState } from './lib/trainer-state';

async function testNoRepetition() {
  console.log('\n🧪 TESTING NO REPETITION - Agents Should Not Repeat Addressed Concerns\n');
  console.log('=' .repeat(60));
  
  // Test scenario: Sarah shouldn't repeat POSM and trial size concerns
  console.log('\nSCENARIO: Product Not Present - Testing repetition\n');
  console.log('-'.repeat(60));
  
  const state = createInitialState('product_absent', ['Ice Cold Serve', 'Visibility']);
  const conversationHistory: string[] = [];
  
  // Turn 1: BA offers cocktail collaboration
  state.turn = 1;
  console.log('Turn 1:');
  console.log('BA: We can create unique cocktails with your team instead of boring shots');
  
  const response1 = await getAgentResponse(
    'product_absent',
    state,
    "We can create unique cocktails with your team instead of boring shots",
    'medium',
    conversationHistory
  );
  console.log(`SARAH: ${response1.reply}\n`);
  
  // Turn 2: BA agrees to one bottle
  state.turn = 2;
  conversationHistory.push('cocktails_discussed');
  console.log('Turn 2:');
  console.log('BA: Sure we can start with one bottle just');
  conversationHistory.push('trial_size_agreed'); // Mark as agreed
  
  const response2 = await getAgentResponse(
    'product_absent',
    state,
    "Sure we can start with one bottle just",
    'medium',
    conversationHistory
  );
  console.log(`SARAH: ${response2.reply}`);
  
  // Check if Sarah mentions trial size again
  const mentionsTrialAgain = response2.reply.toLowerCase().includes('bottle') || 
                             response2.reply.toLowerCase().includes('trial') ||
                             response2.reply.toLowerCase().includes('consignment');
  console.log(`\n✓ Mentions trial size again: ${mentionsTrialAgain ? '❌ FAIL' : '✅ PASS'}\n`);
  
  // Turn 3: BA agrees to custom/minimal POSM
  state.turn = 3;
  console.log('Turn 3:');
  console.log('BA: Sure we can make fully custom design according to your request');
  conversationHistory.push('posm_agreed'); // Mark POSM as agreed
  
  const response3 = await getAgentResponse(
    'product_absent',
    state,
    "Sure we can make fully custom design according to your request",
    'medium',
    conversationHistory
  );
  console.log(`SARAH: ${response3.reply}`);
  
  // Check if Sarah mentions POSM again
  const mentionsPOSMAgain = response3.reply.toLowerCase().includes('posm') || 
                            response3.reply.toLowerCase().includes('material') ||
                            response3.reply.toLowerCase().includes('poster') ||
                            response3.reply.toLowerCase().includes('display') ||
                            response3.reply.toLowerCase().includes('minimal');
  console.log(`\n✓ Mentions POSM again: ${mentionsPOSMAgain ? '❌ FAIL' : '✅ PASS'}`);
  
  // Check if conversation is progressing toward closure
  const showsAgreement = response3.reply.toLowerCase().includes('deal') ||
                        response3.reply.toLowerCase().includes('let\'s') ||
                        response3.reply.toLowerCase().includes('try') ||
                        response3.reply.toLowerCase().includes('sounds good') ||
                        response3.reply.toLowerCase().includes('i\'ll take');
  console.log(`✓ Shows progress toward agreement: ${showsAgreement ? '✅ PASS' : '⚠️ Should be closing'}\n`);
  
  // Turn 4: BA confirms again
  state.turn = 4;
  console.log('Turn 4:');
  console.log('BA: Perfect, one bottle with minimal custom materials as discussed');
  
  const response4 = await getAgentResponse(
    'product_absent',
    state,
    "Perfect, one bottle with minimal custom materials as discussed",
    'medium',
    conversationHistory
  );
  console.log(`SARAH: ${response4.reply}`);
  
  // Final check - should be agreeing by now
  const finalAgreement = response4.reply.toLowerCase().includes('deal') ||
                        response4.reply.toLowerCase().includes('let\'s do it') ||
                        response4.reply.toLowerCase().includes('sounds good') ||
                        response4.reply.toLowerCase().includes('perfect') ||
                        response4.reply.toLowerCase().includes('i\'ll take it');
  console.log(`\n✓ Final agreement reached: ${finalAgreement ? '✅ PASS' : '❌ FAIL'}\n`);
  
  console.log('=' .repeat(60));
  console.log('SUMMARY:');
  console.log('✓ Agent should NOT repeat concerns about trial size after BA agrees');
  console.log('✓ Agent should NOT repeat concerns about POSM after BA agrees');
  console.log('✓ Agent should progress toward agreement when concerns are addressed');
  console.log('✓ Agent should close the deal after 2-3 concerns are resolved');
  console.log('=' .repeat(60));
}

// Run the test
testNoRepetition().catch(console.error);