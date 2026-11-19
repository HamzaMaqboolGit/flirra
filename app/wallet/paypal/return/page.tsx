'use client';
import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { readApiJson } from '@/lib/client-api';

export default function PayPalReturnPage(){
 const [message,setMessage]=useState('Confirming payment with PayPal…');
 useEffect(()=>{const params=new URLSearchParams(location.search);const orderId=params.get('token');if(params.get('cancelled')==='1'){if(orderId)void fetch('/api/wallet/paypal/cancel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId})}).finally(()=>location.replace('/wallet?paypal=cancelled'));else location.replace('/wallet?paypal=cancelled');return}if(!orderId){setMessage('PayPal did not return an order reference. Return to your wallet to check your purchase.');return}let active=true;void (async()=>{try{const response=await fetch('/api/wallet/paypal/capture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId})});const result=await readApiJson(response,'PayPal could not confirm this payment.') as {verified?:boolean;error?:string};if(!response.ok||!result.verified)throw new Error(result.error||'PayPal has not confirmed the payment.');if(active)location.replace('/wallet?paypal=success')}catch(error){if(active)setMessage(error instanceof Error?error.message:'PayPal could not confirm this payment.')}})();return()=>{active=false}},[]);
 return <main className="wallet-page" style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24}}><section className="admin-v2-card" style={{width:'min(520px,100%)',textAlign:'center'}}><LoaderCircle className="wallet-checkout-spinner" size={28}/><h1>PayPal Checkout</h1><p role="status">{message}</p><a href="/wallet">Return to wallet</a></section></main>
}
