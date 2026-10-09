import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Profile } from './schema'
import type { ProfileRepository } from './repository'

interface ProfileSession { profile: Profile; repository: ProfileRepository; save: (next: Profile) => Promise<void> }
const ProfileContext = createContext<ProfileSession | null>(null)
export function ProfileProvider({ initial, repository, children }: { initial: Profile; repository: ProfileRepository; children: ReactNode }) {
  const [profile, setProfile] = useState(initial)
  const save = async (next: Profile) => { setProfile(await repository.save(next)) }
  return <ProfileContext.Provider value={{ profile, repository, save }}>{children}</ProfileContext.Provider>
}
export function useProfile() { return useContext(ProfileContext) }
