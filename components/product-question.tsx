'use client';
import {useActionState} from 'react';
import {askProductQuestion} from '@/app/item/question-action';
export function ProductQuestion({itemId}:{itemId:string}){
 const [message,action,pending]=useActionState(askProductQuestion,'');
 return <details className="product-question"><summary>Ask about this item</summary><p>No account needed. Please do not include passwords, payment details or private order information.</p><form action={action}><input type="hidden" name="item" value={itemId}/><label style={{display:'none'}} aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label><label>Your email<input name="email" type="email" maxLength={254} required autoComplete="email"/></label><label>Question<textarea name="question" minLength={10} maxLength={2000} rows={4} required/></label><p>We use your email to respond to this question. <a href="/privacy">Privacy notice</a></p><button disabled={pending}>{pending?'Sending…':'Send question'}</button><p role="status">{message}</p></form></details>;
}
