import { AccessToken } from 'livekit-server-sdk'

export function isLivekitConfigured() {
  const url = String(process.env.LIVEKIT_URL || '').trim()
  const key = String(process.env.LIVEKIT_API_KEY || '').trim()
  const secret = String(process.env.LIVEKIT_API_SECRET || '').trim()
  return !!(url && key && secret)
}

/** WebSocket URL для livekit-client (wss://…). */
export function livekitWsUrl() {
  return String(process.env.LIVEKIT_URL || '').trim()
}

export function liveRoomName(channelId) {
  return `vibe-ch-${channelId}`
}

export async function mintPublisherToken({ roomName, identity, name }) {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity,
    name: name || identity,
    ttl: '4h',
  })
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })
  return at.toJwt()
}

export async function mintViewerToken({ roomName, identity, name }) {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity,
    name: name || identity,
    ttl: '4h',
  })
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
    canPublishData: true,
  })
  return at.toJwt()
}
