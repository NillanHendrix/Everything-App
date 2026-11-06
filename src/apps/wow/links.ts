import type { Character } from './api'

// Externe Profilseiten für einen Charakter, je nach Spielversion.
export function profileLinks({ game, region, realm, name }: Character) {
  const n = encodeURIComponent(name.toLowerCase())
  const path = `${region}/${realm}/${n}`
  switch (game) {
    case 'retail':
      return [
        { label: 'Arsenal', url: `https://worldofwarcraft.blizzard.com/de-de/character/${path}` },
        { label: 'Raider.IO', url: `https://raider.io/characters/${path}` },
        { label: 'Warcraft Logs', url: `https://www.warcraftlogs.com/character/${path}` },
        { label: 'WoWProgress', url: `https://www.wowprogress.com/character/${path}` },
        { label: 'Check-PvP', url: `https://check-pvp.fr/${path}` },
      ]
    case 'classic':
      return [{ label: 'Warcraft Logs', url: `https://classic.warcraftlogs.com/character/${path}` }]
    case 'classic1x':
      return [{ label: 'Warcraft Logs', url: `https://vanilla.warcraftlogs.com/character/${path}` }]
    case 'classicann':
      return [{ label: 'Warcraft Logs', url: `https://fresh.warcraftlogs.com/character/${path}` }]
    default:
      return []
  }
}
