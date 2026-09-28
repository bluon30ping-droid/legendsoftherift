import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 2567);
const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function roomCode() {
  let code = '';
  do { code = Array.from({length: 6}, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function send(ws, payload) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload)); }
function broadcast(room, payload, except = null) {
  for (const p of room.players) if (p.ws !== except) send(p.ws, payload);
}
function cleanRoom(room) {
  for (const p of room.players) { try { p.ws.close(); } catch {} }
  rooms.delete(room.code);
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {'content-type':'application/json','access-control-allow-origin':'*'});
    res.end(JSON.stringify({ok:true,service:'Legends of the Rift Online',rooms:rooms.size}));
    return;
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({server:httpServer});

wss.on('connection', ws => {
  const player = {ws, room:null, legend:0, map:0, index:-1};

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return send(ws,{type:'error',message:'Invalid network message.'}); }

    if (m.type === 'create') {
      if (player.room) return;
      const code = roomCode();
      const room = {code, players:[], started:false, map:Number(m.map)||0};
      player.room = room; player.legend=Number(m.legend)||0; player.map=room.map; player.index=0;
      room.players.push(player); rooms.set(code, room);
      return send(ws,{type:'created',room:code,host:true,opponent:false});
    }

    if (m.type === 'join') {
      if (player.room) return;
      const code=String(m.room||'').toUpperCase(); const room=rooms.get(code);
      if (!room) return send(ws,{type:'error',message:'Room not found.'});
      if (room.players.length>=2) return send(ws,{type:'error',message:'Room is full.'});
      if (room.started) return send(ws,{type:'error',message:'Match already started.'});
      player.room=room; player.legend=Number(m.legend)||0; player.map=room.map; player.index=1; room.players.push(player);
      const host=room.players[0];
      send(ws,{type:'joined',room:code,host:false,opponent:true});
      send(host.ws,{type:'opponent-joined',opponentLegend:player.legend});
      return;
    }

    if (m.type === 'start') {
      const room=player.room; if(!room||room.players.length!==2||player.index!==0||room.started)return;
      room.started=true; room.map=Math.max(0,Math.min(7,Number(m.map)||0));
      const p0=room.players[0],p1=room.players[1];
      const players=[Number(m.players?.[0] ?? p0.legend), Number(m.players?.[1] ?? p1.legend)];
      p0.legend=players[0];p1.legend=players[1];
      broadcast(room,{type:'start',map:room.map,players,hostStart:true});
      return;
    }

    if (m.type === 'input') {
      if (!player.room || !player.room.started) return;
      // Input is intentionally small and schema-like; the host uses it to keep the two simulations aligned.
      broadcast(player.room,{type:'input',down:m.down||{},pressed:m.pressed||{}},ws);
      return;
    }

    if (m.type === 'snapshot') {
      if (!player.room || !player.room.started || player.index!==0) return;
      broadcast(player.room,{type:'snapshot',players:Array.isArray(m.players)?m.players:[]},ws);
      return;
    }

    if (m.type === 'event') {
      if (!player.room || !player.room.started || player.index!==0) return;
      broadcast(player.room,{type:'event',event:m.event,killer:m.killer,victim:m.victim},ws);
      return;
    }

    if (m.type === 'leave') ws.close();
  });

  ws.on('close', () => {
    const room=player.room; if(!room)return;
    room.players=room.players.filter(p=>p!==player);
    for(const p of room.players) send(p.ws,{type:'peer-left'});
    if(room.players.length===0) rooms.delete(room.code);
    else if(!room.started) rooms.delete(room.code);
    else room.players[0].index=0;
  });
});

httpServer.listen(PORT, '0.0.0.0', () => console.log(`Legends of the Rift online server listening on ${PORT}`));
