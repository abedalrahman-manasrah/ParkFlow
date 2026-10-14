import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'node:http';
import type { Request } from 'express';
import { redis } from '../database/redis';
import { origins } from '../config/env';
import { authenticateRequest } from '../modules/auth/webSession';
import { ApiError } from '../utils/errors';
export function attachSockets(server:HttpServer){const io=new Server(server,{cors:{origin:origins,credentials:true},allowRequest:(request,done)=>{const origin=request.headers.origin;done(null,!origin||origins.includes(origin));}});const pub=redis.duplicate(),sub=redis.duplicate();io.adapter(createAdapter(pub,sub));
 io.use(async(socket,next)=>{
  const handshake=socket.handshake;
  // Browser credentials come only from HttpOnly cookies. Treat namespace
  // establishment as an unsafe operation, requiring the same CSRF proof.
  const headers:Record<string,string|undefined>={origin:handshake.headers.origin,cookie:handshake.headers.cookie};
  if(handshake.headers.origin){
   for(const [name,field] of [['x-parkflow-app','application'],['x-parkflow-session','sessionId'],['x-parkflow-login','loginId'],['x-parkflow-csrf','csrfToken']] as const){const value=handshake.auth[field];headers[name]=typeof value==='string'?value:undefined;}
  }else if(typeof handshake.auth.token==='string'){headers.authorization=`Bearer ${handshake.auth.token}`;}
  const request={method:'POST',get:(name:string)=>headers[name.toLowerCase()]} as unknown as Request;
  socket.data.request=request;
  try{socket.data.auth=await authenticateRequest(request);next();}catch(error){next(new Error(error instanceof ApiError?error.code:'UNAUTHORIZED'));}
 });
 io.on('connection',socket=>{const a=socket.data.auth;socket.join(`user:${a.userId}`);socket.join('community');const expiry=setTimeout(()=>socket.disconnect(true),Math.max(1,a.exp*1000-Date.now()));const check=setInterval(()=>{void authenticateRequest(socket.data.request).catch(()=>socket.disconnect(true));},30000);socket.on('disconnect',()=>{clearTimeout(expiry);clearInterval(check);});});
 return {io,close:async()=>{await new Promise<void>(r=>io.close(()=>r()));await pub.quit();await sub.quit();}};
}
