import { useEffect } from 'react';
import { AppState,Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { API_BASE_URL,api,refreshSession } from '../services/http/apiClient';
import { retryQueue } from '../offline/retryQueue';
import { isWebSession, sessionIdentity, socketSessionOptions } from '../services/http/browserSession';
export function useBackendSync(){
 const session=useAuthStore(s=>s.session);const client=useQueryClient();
 useEffect(()=>{client.clear();},[session?.userId,client]);
 useEffect(()=>{if(!session||!API_BASE_URL)return;
 const socket=io(API_BASE_URL.replace(/\/api\/v1$/,''),{...socketSessionOptions(session),transports:['websocket'],reconnection:true});
 const invalidate=(keys:string[])=>{for(const key of keys)void client.invalidateQueries({queryKey:[key]});};
 socket.on('checkpoint.updated',()=>invalidate(['roads','route']));socket.on('parking.availability.updated',()=>invalidate(['zones','zone']));socket.on('parking.zone.updated',()=>invalidate(['zones','zone','reservation-quote']));socket.on('parking.session.updated',()=>invalidate(['sessions','session','wallet','transactions','trust']));socket.on('notification.created',()=>invalidate(['notifications','wallet','transactions','violations']));socket.on('trust.updated',()=>invalidate(['trust']));socket.on('connect',()=>void client.invalidateQueries());
 socket.on('connect_error',(error:Error)=>{if(useAuthStore.getState().session&&(Date.parse(session.expiresAt)<=Date.now()+30000||(isWebSession(session)&&['UNAUTHORIZED','SESSION_CHANGED'].includes(error.message))))void refreshSession().catch(()=>undefined);});
 // Socket.IO deliberately disables automatic reconnection after a server
 // disconnect. Recover the initiating web login through the guarded refresh
 // path; a changed login is rejected without adopting its cookie identity.
 socket.on('disconnect',(reason:string)=>{if(reason==='io server disconnect'&&isWebSession(session)&&useAuthStore.getState().session===session)void refreshSession().catch(()=>undefined);});
 const timer=setTimeout(()=>{void refreshSession().catch(()=>undefined);},Math.max(1000,Date.parse(session.expiresAt)-Date.now()-30000));
 const subscription=AppState.addEventListener('change',state=>{if(state==='active'){void client.invalidateQueries();void retryQueue.flush();if(!socket.connected)socket.connect();}});
 void retryQueue.flush();
 return()=>{clearTimeout(timer);subscription.remove();socket.disconnect();};
 },[sessionIdentity(session),client]);
 useEffect(()=>{if(!session?.userId||Platform.OS==='web')return;let token:string|undefined,cancelled=false;
 const register=async()=>{const Notifications=await import('expo-notifications');const Constants=(await import('expo-constants')).default;
 // Expo Go and projects without push credentials continue using durable in-app notifications.
 const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;if(!projectId)return;
 const permission=await Notifications.getPermissionsAsync();if(!permission.granted)return;
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('default',{name:'ParkFlow',importance:Notifications.AndroidImportance.DEFAULT});
 token=(await Notifications.getExpoPushTokenAsync({projectId})).data;if(cancelled)return;
 await api('/notifications/device-tokens',{method:'POST',body:{token,platform:Platform.OS,provider:'expo'}});
 };
 void register().catch(()=>undefined);return()=>{cancelled=true;};
 },[session?.userId]);
 const locale=usePreferencesStore(s=>s.locale);
 useEffect(()=>{if(session?.userId)void api('/users/me',{method:'PATCH',body:{locale}}).catch(()=>undefined);},[session?.userId,locale]);
}
