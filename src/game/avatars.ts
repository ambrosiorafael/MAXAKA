export type AvatarOption = {
  emoji: string
  name: string
}

export type AvatarCategory = {
  id: string
  label: string
  avatars: AvatarOption[]
}

export const defaultAvatar = '🦁'

export const avatarCategories: AvatarCategory[] = [
  {
    id: 'people',
    label: 'Pessoas',
    avatars: [
      { emoji: '😀', name: 'Sorriso' },
      { emoji: '😎', name: 'Óculos de sol' },
      { emoji: '🥳', name: 'Festa' },
      { emoji: '🤓', name: 'Estudioso' },
      { emoji: '🤠', name: 'Cowboy' },
      { emoji: '🧐', name: 'Investigador' },
      { emoji: '😇', name: 'Anjo' },
      { emoji: '🤩', name: 'Estrelas nos olhos' },
      { emoji: '🥸', name: 'Disfarçado' },
      { emoji: '😏', name: 'Sorriso confiante' },
      { emoji: '🤗', name: 'Abraço' },
      { emoji: '🤫', name: 'Silêncio' },
      { emoji: '🤯', name: 'Surpreendido' },
      { emoji: '😜', name: 'A piscar o olho' },
      { emoji: '😴', name: 'A dormir' },
      { emoji: '🫡', name: 'Saudação' },
    ],
  },
  {
    id: 'fantasy',
    label: 'Fantasia',
    avatars: [
      { emoji: '🦸', name: 'Super-herói' },
      { emoji: '🦹', name: 'Supervilão' },
      { emoji: '🧙', name: 'Feiticeiro' },
      { emoji: '🧝', name: 'Elfo' },
      { emoji: '🧛', name: 'Vampiro' },
      { emoji: '🧟', name: 'Zumbi' },
      { emoji: '🧞', name: 'Génio' },
      { emoji: '👑', name: 'Coroa' },
      { emoji: '🤖', name: 'Robô' },
      { emoji: '👽', name: 'Alienígena' },
      { emoji: '👻', name: 'Fantasma' },
      { emoji: '💀', name: 'Esqueleto' },
      { emoji: '🎅', name: 'Pai Natal' },
      { emoji: '🧑‍🚀', name: 'Astronauta' },
      { emoji: '🧑‍🎤', name: 'Cantor' },
      { emoji: '🧑‍🎨', name: 'Artista' },
      { emoji: '🧑‍🚒', name: 'Bombeiro' },
      { emoji: '🧑‍💻', name: 'Programador' },
    ],
  },
  {
    id: 'animals',
    label: 'Animais',
    avatars: [
      { emoji: '🐯', name: 'Tigre' },
      { emoji: '🦁', name: 'Leão' },
      { emoji: '🐺', name: 'Lobo' },
      { emoji: '🦊', name: 'Raposa' },
      { emoji: '🐼', name: 'Panda' },
      { emoji: '🐻', name: 'Urso' },
      { emoji: '🐸', name: 'Sapo' },
      { emoji: '🐵', name: 'Macaco' },
      { emoji: '🐶', name: 'Cão' },
      { emoji: '🐱', name: 'Gato' },
      { emoji: '🐴', name: 'Cavalo' },
      { emoji: '🦄', name: 'Unicórnio' },
      { emoji: '🦅', name: 'Águia' },
      { emoji: '🦉', name: 'Coruja' },
      { emoji: '🐧', name: 'Pinguim' },
      { emoji: '🐨', name: 'Coala' },
      { emoji: '🐮', name: 'Vaca' },
      { emoji: '🐙', name: 'Polvo' },
      { emoji: '🐘', name: 'Elefante' },
      { emoji: '🦜', name: 'Papagaio' },
      { emoji: '🐆', name: 'Leopardo' },
      { emoji: '🐢', name: 'Tartaruga' },
      { emoji: '🦒', name: 'Girafa' },
      { emoji: '🐒', name: 'Macaco brincalhão' },
      { emoji: '🦩', name: 'Flamingo' },
      { emoji: '🦈', name: 'Tubarão' },
      { emoji: '🐍', name: 'Cobra' },
    ],
  },
  {
    id: 'sports',
    label: 'Desporto',
    avatars: [
      { emoji: '⚽', name: 'Futebol' },
      { emoji: '🏀', name: 'Basquetebol' },
      { emoji: '🏈', name: 'Futebol americano' },
      { emoji: '⚾', name: 'Basebol' },
      { emoji: '🎾', name: 'Ténis' },
      { emoji: '🏆', name: 'Troféu' },
      { emoji: '🥇', name: 'Medalha de ouro' },
      { emoji: '🥉', name: 'Medalha de bronze' },
      { emoji: '🏋️', name: 'Halterofilismo' },
      { emoji: '🚴', name: 'Ciclismo' },
      { emoji: '🏎️', name: 'Corrida automóvel' },
      { emoji: '🎮', name: 'Jogos eletrónicos' },
      { emoji: '👟', name: 'Corrida' },
      { emoji: '🥊', name: 'Boxe' },
      { emoji: '🏄', name: 'Surf' },
      { emoji: '🤺', name: 'Esgrima' },
      { emoji: '🥋', name: 'Artes marciais' },
      { emoji: '🏅', name: 'Medalha desportiva' },
    ],
  },
  {
    id: 'special',
    label: 'Especiais MAXAKA',
    avatars: [
      { emoji: '🔥', name: 'Fogo' },
      { emoji: '⚡', name: 'Raio' },
      { emoji: '💎', name: 'Diamante' },
      { emoji: '👑', name: 'Coroa MAXAKA' },
      { emoji: '🌟', name: 'Estrela' },
      { emoji: '☠️', name: 'Perigo' },
      { emoji: '🎯', name: 'Alvo' },
      { emoji: '🚀', name: 'Foguetão' },
      { emoji: '💥', name: 'Explosão' },
      { emoji: '🌀', name: 'Redemoinho' },
      { emoji: '🔧', name: 'Ferramenta' },
      { emoji: '🌍', name: 'Planeta Terra' },
      { emoji: '🛡️', name: 'Escudo' },
      { emoji: '🧿', name: 'Amuleto' },
      { emoji: '🎭', name: 'Máscaras' },
      { emoji: '🪄', name: 'Varinha mágica' },
      { emoji: '💫', name: 'Brilho' },
      { emoji: '🏴‍☠️', name: 'Bandeira pirata' },
    ],
  },
  {
    id: 'skin-tones',
    label: 'Tons de pele',
    avatars: [
      { emoji: '👨🏻', name: 'Homem, tom de pele claro' },
      { emoji: '👨🏼', name: 'Homem, tom de pele claro médio' },
      { emoji: '👨🏽', name: 'Homem, tom de pele médio' },
      { emoji: '👨🏾', name: 'Homem, tom de pele escuro médio' },
      { emoji: '👨🏿', name: 'Homem, tom de pele escuro' },
      { emoji: '👩🏻', name: 'Mulher, tom de pele claro' },
      { emoji: '👩🏼', name: 'Mulher, tom de pele claro médio' },
      { emoji: '👩🏽', name: 'Mulher, tom de pele médio' },
      { emoji: '👩🏾', name: 'Mulher, tom de pele escuro médio' },
      { emoji: '👩🏿', name: 'Mulher, tom de pele escuro' },
      { emoji: '🧑🏽', name: 'Pessoa, tom de pele médio' },
      { emoji: '🧑🏿', name: 'Pessoa, tom de pele escuro' },
    ],
  },
]

export const avatarOptions = [...new Map(
  avatarCategories.flatMap((category) => category.avatars).map((avatar) => [avatar.emoji, avatar]),
).values()]

export const avatarValues = new Set(avatarOptions.map(({ emoji }) => emoji))

export function isAvatar(value: string): boolean {
  return avatarValues.has(value)
}
