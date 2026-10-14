import type { AuthConfig, AuthService, AuthVerificationOptions } from '@parkflow/contracts/services';
import { api } from './apiClient';
import { useAuthStore } from '../../store/authStore';
async function signIn(path:string,body:unknown,options?:AuthVerificationOptions){
 const result=await api<Awaited<ReturnType<AuthService['verifyOtp']>>>(path,{method:'POST',body,public:true});
 if(options?.shouldApply?.()===false){
  const error=new Error('Verification request was cancelled');
  error.name='AbortError';
  throw error;
 }
 await useAuthStore.getState().signIn(result.session,result.user,options?.shouldApply);
 return result;
}
export const httpAuthService:AuthService={
 async getConfig(){
  const config=await api<AuthConfig>('/auth/config',{public:true});
  if(typeof config?.developmentLoginEnabled!=='boolean'||typeof config?.developmentEmailLoginEnabled!=='boolean'
   ||(config.loginMethod!=='email'&&config.loginMethod!=='phone')
   ||(config.developmentEmailLoginEnabled&&config.loginMethod!=='email')
   ||(config.developmentLoginEnabled&&config.loginMethod!=='phone')
   ||(config.developmentEmailLoginEnabled&&config.developmentLoginEnabled)) throw new Error('Invalid authentication config');
  return config;
 },
 devPhoneLogin:body=>signIn('/auth/phone/dev-login',body),
 requestPhoneOtp:body=>api('/auth/phone/request-otp',{method:'POST',body,public:true}),
 verifyPhoneOtp:body=>signIn('/auth/phone/verify-otp',body),
 completePhoneProfile:body=>api('/users/me/complete-profile',{method:'POST',body}),
 requestOtp:body=>api('/auth/request-otp',{method:'POST',body,public:true}),
 devLogin:body=>signIn('/auth/dev-login',body),
 verifyOtp:(body,options)=>signIn('/auth/verify-otp',body,options),
 completeProfile:({fullName})=>api('/users/me',{method:'PATCH',body:{fullName}}),
 refresh:refreshToken=>api('/auth/refresh',{method:'POST',body:{refreshToken},public:true}),
 async signOut(){try{await api('/auth/logout',{method:'POST',body:{}});}finally{await useAuthStore.getState().signOut();}},
};
