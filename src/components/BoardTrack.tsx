import { useEffect, useMemo, useRef, useState } from 'react'

export type BoardTeam = {
  id: number
  name: string
  color: string
  position: number
  members: Array<{
    id: string
    name: string
    avatar: string
    isBot: boolean
  }>
}

type BoardTrackProps = {
  teams: BoardTeam[]
  boardLength: number
  activeTeamId: number
}

export default function BoardTrack({ teams, boardLength, activeTeamId }: BoardTrackProps) {
  const targetSignature = teams.map((team) => `${team.id}:${team.position}`).join(',')
  const [visualPositions, setVisualPositions] = useState(() => new Map(teams.map((team) => [team.id, team.position])))
  const visualPositionsRef = useRef(visualPositions)
  const targets = useMemo(
    () => new Map<number, number>(
      targetSignature.split(',').filter(Boolean).map((entry) => {
        const [teamId, position] = entry.split(':').map(Number)
        return [teamId, position]
      }),
    ),
    [targetSignature],
  )

  useEffect(() => {
    let timer: number | undefined
    const teamIds = [...targets.keys()]

    const step = () => {
      const current = visualPositionsRef.current
      let hasMovement = false
      const next = new Map<number, number>()

      for (const teamId of teamIds) {
        const position = current.get(teamId) ?? 0
        const target = targets.get(teamId) ?? position
        if (position !== target) hasMovement = true
        next.set(teamId, position === target ? position : position + Math.sign(target - position))
      }

      if (!hasMovement) return
      visualPositionsRef.current = next
      setVisualPositions(next)
      timer = window.setTimeout(step, 130)
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timer = window.setTimeout(() => {
        const next = new Map(targets)
        visualPositionsRef.current = next
        setVisualPositions(next)
      }, 0)
    } else {
      timer = window.setTimeout(step, 130)
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [targetSignature, targets])

  return (
    <div className="track live-track" aria-label={`Tabuleiro: início, ${boardLength - 1} casas e chegada`}>
      {Array.from({ length: boardLength + 1 }, (_, position) => {
        const isStart = position === 0
        const isFinish = position === boardLength
        const teamsAtPosition = teams.filter((team) => (visualPositions.get(team.id) ?? 0) === position)

        return (
          <span
            className={`track-tile ${teamsAtPosition.length ? 'track-player' : ''} ${isStart ? 'track-start' : ''} ${isFinish ? 'track-finish' : ''}`}
            key={position}
            aria-label={isStart ? 'Início' : isFinish ? 'Chegada' : `Casa ${position}`}
            style={{
              gridRow: Math.floor(position / 5) + 1,
              gridColumn: Math.floor(position / 5) % 2 === 0
                ? (position % 5) + 1
                : 5 - (position % 5),
            }}
          >
            <span>{isStart ? 'INÍCIO' : isFinish ? 'CHEGADA' : position}</span>
            {teamsAtPosition.length > 0 && (
              <span className="track-pieces">
                {teamsAtPosition.map((team) => (
                  <i
                    className={`track-token track-token-${team.color} ${team.id === activeTeamId ? 'track-token-active' : ''}`}
                    key={team.id}
                    aria-label={`${team.name}, casa ${position}`}
                    title={`${team.name}: ${isStart ? 'Início' : isFinish ? 'Chegada' : `casa ${position}`}`}
                  >
                    {team.id}
                  </i>
                ))}
              </span>
            )}
          </span>
        )
      })}
      <div className="board-center-brand" aria-label="MAXAKA">
        <span className="brand-mark" aria-hidden="true">M</span>
        <strong>MAXAKA<span>.</span></strong>
      </div>
    </div>
  )
}
