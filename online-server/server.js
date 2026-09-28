import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 2567);
const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:min));
function roomCode(){let c='';do{c=Array.from({length:6},()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join('')}while(rooms.has(c));return c;}
function send(ws,p){if(ws.readyState===1)ws.send(JSON.stringify(p));}
function lobbyState(room){return {type:'lobby-state',room:room.code,map:room.map,hostIndex:0,players:room.players.map(p=>({legend:p.legend})),readyStates:[0,1].map(i=>!!room.players[i]?.ready)};}
function broadcast(room,p){for(const player of room.players)send(player.ws,p);}
function broadcastLobby(room){broadcast(room,lobbyState(room));}
const httpServer=http.createServer((req,res)=>{if(req.url==='/'||req.url==='/health'){res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});res.end(JSON.stringify({ok:true,service:'Legends of the Rift Online',rooms:rooms.size}));return;}res.writeHead(404);res.end();});
const wss=new WebSocketServer({server:httpServer});

wss.on('connection',ws=>{
  const player={ws,room:null,index:-1,legend:0,ready:false};
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw.toString())}catch{return send(ws,{type:'error',message:'Invalid network message.'});}
    if(m.type==='create'){
      if(player.room)return;
      const room={code:roomCode(),players:[],started:false,map:0};
      player.room=room;player.index=0;player.legend=clamp(Number(m.legend),0,7);player.ready=false;room.players.push(player);rooms.set(room.code,room);
      send(ws,{type:'created',room:room.code,host:true,localIndex:0,map:room.map,players:[{legend:player.legend}],readyStates:[false,false]});
      broadcastLobby(room);
      return;
    }
    if(m.type==='join'){
      if(player.room)return;
      const room=rooms.get(String(m.room||'').trim().toUpperCase());
      if(!room)return send(ws,{type:'error',message:'Room not found.'});
      if(room.players.length>=2)return send(ws,{type:'error',message:'Room is full.'});
      if(room.started)return send(ws,{type:'error',message:'Match already started.'});
      player.room=room;player.index=1;player.legend=clamp(Number(m.legend),0,7);player.ready=false;room.players.push(player);
      send(ws,{type:'joined',room:room.code,host:false,localIndex:1,map:room.map,players:room.players.map(p=>({legend:p.legend})),readyStates:room.players.map(p=>!!p.ready)});
      broadcastLobby(room);
      return;
    }
    const room=player.room;if(!room)return;
    if(m.type==='map'){
      if(player.index!==0||room.started)return;
      room.map=clamp(Number(m.map),0,7);
      // Changing the map invalidates ready state so both players explicitly confirm the new setup.
      for(const p of room.players)p.ready=false;
      broadcastLobby(room);
      return;
    }
    if(m.type==='legend'){
      if(room.started)return;
      player.legend=clamp(Number(m.legend),0,7);
      player.ready=false;
      broadcastLobby(room);
      return;
    }
    if(m.type==='ready'){
      if(room.started||room.players.length!==2)return;
      player.ready=!!m.ready;
      broadcastLobby(room);
      if(room.players.length===2&&room.players.every(p=>p.ready)){
        room.started=true;
        broadcast(room,{type:'start',room:room.code,map:room.map,players:room.players.map(p=>p.legend)});
      }
      return;
    }
    if(m.type==='input'){if(!room.started)return;for(const p of room.players)if(p!==player)send(p,{type:'input',down:m.down||{},pressed:m.pressed||{}});return;}
    if(m.type==='snapshot'){if(!room.started||player.index!==0)return;for(const p of room.players)if(p!==player)send(p,{type:'snapshot',players:Array.isArray(m.players)?m.players:[]});return;}
    if(m.type==='event'){if(!room.started||player.index!==0)return;for(const p of room.players)if(p!==player)send(p,{type:'event',event:m.event,killer:m.killer,victim:m.victim});return;}
    if(m.type==='leave'){try{ws.close()}catch{}}
  });
  ws.on('close',()=>{
    const room=player.room;if(!room)return;
    room.players=room.players.filter(p=>p!==player);
    if(room.players.length===0){rooms.delete(room.code);return;}
    for(const p of room.players){p.index=0;p.ready=false;}
    room.started=false;
    const remaining=room.players[0];
    send(remaining.ws,{type:'peer-left'});
    if(remaining)send(remaining.ws,{type:'host-transferred',host:true,localIndex:0});
    broadcastLobby(room);
  });
});
httpServer.listen(PORT,'0.0.0.0',()=>console.log(`Legends of the Rift online server listening on ${PORT}`));
