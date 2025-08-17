// Test that agents just answer questions without volunteering solutions
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

import { getAgentResponse } from './lib/agent';
import { createInitialState } from './lib/trainer-state';

async function testJustAnswer() {
  console.log('\n🧪 TESTING JUST ANSWER - Agents Should Only Answer What\'s Asked\n');
  console.log('=' .repeat(60));
  
  // Test 1: Tom should just describe current promos, not offer Jäger trial
  console.log('\nTEST 1: No Promo - Tom Asked About Current Promos');
  console.log('-'.repeat(40));
  
  const state1 = createInitialState('no_promo', ['Visibility']);
  state1.turn = 1;
  
  const response1 = await getAgentResponse(
    'no_promo',
    state1,
    "What promos do you run here now?",
    'medium',
    []
  );
  
  console.log('BA: What promos do you run here now?');
  console.log(`TOM: ${response1.reply}\n`);
  
  // Check if Tom mentions trial or Jäger unprompted
  const mentionsTrialUnprompted = response1.reply.toLowerCase().includes('trial') || 
                                  response1.reply.toLowerCase().includes('try') ||
                                  response1.reply.toLowerCase().includes('jäger') ||
                                  response1.reply.toLowerCase().includes('happy to');
  console.log(`✓ Mentions trial/Jäger unprompted: ${mentionsTrialUnprompted ? '❌ FAIL' : '✅ PASS'}`);
  
  // Check if Tom just answers the question
  const answersAboutPromos = response1.reply.toLowerCase().includes('happy hour') || 
                             response1.reply.toLowerCase().includes('quiz') ||
                             response1.reply.toLowerCase().includes('special') ||
                             response1.reply.toLowerCase().includes('we run') ||
                             response1.reply.toLowerCase().includes('we do');
  console.log(`✓ Answers about current promos: ${answersAboutPromos ? '✅ PASS' : '❌ FAIL'}\n`);
  
  // Test 2: Sarah should describe customers, not offer solutions
  console.log('TEST 2: Product Absent - Sarah Asked About Customers');
  console.log('-'.repeat(40));
  
  const state2 = createInitialState('product_absent', ['Ice Cold Serve']);
  state2.turn = 1;
  
  const response2 = await getAgentResponse(
    'product_absent',
    state2,
    "Tell me about your customers and what they like",
    'medium',
    []
  );
  
  console.log('BA: Tell me about your customers and what they like');
  console.log(`SARAH: ${response2.reply}\n`);
  
  const sarahOffersUnprompted = response2.reply.toLowerCase().includes('trial') || 
                                response2.reply.toLowerCase().includes('try') ||
                                response2.reply.toLowerCase().includes('happy to') ||
                                response2.reply.toLowerCase().includes('willing to');
  console.log(`✓ Offers trial unprompted: ${sarahOffersUnprompted ? '❌ FAIL' : '✅ PASS'}`);
  
  const sarahAnswersAboutCustomers = response2.reply.toLowerCase().includes('customer') || 
                                     response2.reply.toLowerCase().includes('crowd') ||
                                     response2.reply.toLowerCase().includes('guest') ||
                                     response2.reply.toLowerCase().includes('they') ||
                                     response2.reply.toLowerCase().includes('our');
  console.log(`✓ Answers about customers: ${sarahAnswersAboutCustomers ? '✅ PASS' : '❌ FAIL'}\n`);
  
  // Test 3: Mark should describe his situation, not agree to anything
  console.log('TEST 3: No Perfect Serve - Mark Asked About Current Setup');
  console.log('-'.repeat(40));
  
  const state3 = createInitialState('no_perfect_serve', ['Ice Cold Serve']);
  state3.turn = 1;
  
  const response3 = await getAgentResponse(
    'no_perfect_serve',
    state3,
    "How do you currently serve shots?",
    'medium',
    []
  );
  
  console.log('BA: How do you currently serve shots?');
  console.log(`MARK: ${response3.reply}\n`);
  
  const markOffersUnprompted = response3.reply.toLowerCase().includes('trial') || 
                               response3.reply.toLowerCase().includes('try') ||
                               response3.reply.toLowerCase().includes('happy to') ||
                               response3.reply.toLowerCase().includes('willing');
  console.log(`✓ Offers solution unprompted: ${markOffersUnprompted ? '❌ FAIL' : '✅ PASS'}`);
  
  const markAnswersAboutSetup = response3.reply.toLowerCase().includes('bottle') || 
                                response3.reply.toLowerCase().includes('shelf') ||
                                response3.reply.toLowerCase().includes('pour') ||
                                response3.reply.toLowerCase().includes('serve') ||
                                response3.reply.toLowerCase().includes('room temp');
  console.log(`✓ Answers about current setup: ${markAnswersAboutSetup ? '✅ PASS' : '❌ FAIL'}\n`);
  
  console.log('=' .repeat(60));
  console.log('SUMMARY:');
  console.log('✓ Agents should ONLY answer what\'s asked');
  console.log('✓ Don\'t volunteer to try Jäger unprompted');
  console.log('✓ Don\'t offer solutions before BA makes a proposal');
  console.log('✓ Let the BA lead the conversation');
  console.log('=' .repeat(60));
}

// Run the test
testJustAnswer().catch(console.error);