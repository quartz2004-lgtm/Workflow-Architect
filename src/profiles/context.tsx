/*
Copyright (C) 2026  quartz2004

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://gnu.org>.
*/

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
