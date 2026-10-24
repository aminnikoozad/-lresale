import {sleep,RetryableError} from 'workflow';

async function advanceReceipt(event:string){
  'use step';
  console.info('stripe_test_receipt_step');
  try{
    const {stripeTestRpc,processStripeTestInbox}=await import('@/lib/stripe-test-server');
    const terminal=(s:{status:string;reviewReason:string|null})=>['processed','ignored'].includes(s.status)||s.reviewReason!==null;
    let state=await stripeTestRpc({name:'state',event}) as {status:string;reviewReason:string|null};
    if(terminal(state))return true;
    await processStripeTestInbox(event);
    state=await stripeTestRpc({name:'state',event}) as {status:string;reviewReason:string|null};
    return terminal(state);
  }catch{
    // Never persist provider errors, request URLs, cookies or secrets in workflow I/O.
    throw new RetryableError('Sandbox receipt temporarily unavailable',{retryAfter:'3m'});
  }
}
advanceReceipt.maxRetries=10;

export async function processStripeReceipt(event:string){
  'use workflow';
  console.info('stripe_test_receipt_workflow');
  // Covers the database retry budget, including its capped hourly backoff.
  for(let n=0;n<180;n++){
    if(await advanceReceipt(event))return 'settled_or_review';
    await sleep('3m');
  }
  throw new Error('Sandbox receipt exceeded the reconciliation window');
}
