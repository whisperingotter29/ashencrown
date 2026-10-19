# Online co-op

Up to four heroes play together. Open the menu (Esc) and choose **Co-op**:

- **Host a game** opens a room and shows a five-letter code. Friends enter the code under
  **Join a friend** in their own game.
- Everyone brings their own saved hero. Gear, gold, XP, quests and loot stay with each player's
  save.
- The host leads. When the host enters or leaves a dungeon, changes realm or fast travels, the
  party goes with them. Guests can use **Go to leader** (or Recall) to catch up.
- Press **Enter** to chat.

## How it plays

- The host's game runs the world: enemies, spawns, time of day and weather. Each guest's screen
  mirrors the enemies near them.
- Every game moves its own hero and resolves the hits that hero takes, so dodging feels the same as
  in single player. A guest's hits on enemies go to the host, who owns enemy health.
- Loot is personal: when an enemy dies, each player nearby (within about 75 m) rolls their own drops
  and gets the XP. Chests in dungeons are per player too.
- Menus don't pause the game while you are in a party.
- A guest who falls rises beside the leader. A party member who falls in a dungeon rises at its
  entrance.
- Partners show on the minimap and the world map as pale blue markers, with name tags and party
  frames under your nameplate.

## Networking

Players connect peer to peer over WebRTC data channels, using [PeerJS](https://peerjs.com).
A signalling server introduces the players; after that, game data goes directly between them. The
host sends each guest about 6 KB/s.

- By default the game uses the free public PeerJS signalling server and Google's public STUN
  servers. No server of our own is needed, so the static Vercel site and the desktop app both work
  as they are.
- Some strict networks (symmetric NAT, some school or office firewalls) block direct connections.
  Those players need a TURN relay. Set `VITE_TURN_URL`, `VITE_TURN_USER` and `VITE_TURN_PASS` at
  build time to add one (for example from Metered, Twilio or a self-hosted coturn).
- To run your own signalling server, run `npm run signal` (port 9000). Then point the game at it
  with `?signal=your-host:9000`, or set `VITE_SIGNAL=your-host:9000` at build time.
- `?net=local` links tabs of one browser through a BroadcastChannel instead. Use it for testing
  without a network.

## Code map

- `src/net/transport.js`: PeerJS and BroadcastChannel links, room codes.
- `src/net/session.js`: the co-op session. It handles who owns what, state and enemy sync, hits,
  kills, travel, time and weather, and chat.
- `src/net/remotePlayer.js`: a partner's hero on this screen. It follows their reports and replays
  their swings, shots, spells and signatures as visuals only.
- `src/ui/coop.js`: the Co-op window, party frames, name tags and chat.
- Hooks elsewhere:
  - `dealDamage` and `killEntity` in `src/systems/combat.js` ask `G.net` who resolves a hit.
  - `Enemy.puppetUpdate` in `src/entities/enemy.js` drives the enemies guests mirror.
  - The spawner spawns around every hero.
  - `bus.muted` keeps a partner's replayed actions from feeding this player's quests, sounds and
    HUD.

### Dev shortcuts

`?quick=human,knight&net=local&coop=host` opens a room as soon as the world loads; the code is in
`window.__coop`. `?quick=elf,ranger&net=local&join=CODE` joins it from a second tab.

## Steam

The desktop build uses the same WebRTC networking. A later step could swap the transport for Steam
Networking Sockets and Steam lobbies through steamworks.js, giving invites through the Steam
friends list and Valve's relay network. `transport.js` is the only file that would change.
