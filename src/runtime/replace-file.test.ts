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

import { describe, expect, it, vi } from 'vitest'
import { replaceFile } from './replace-file'
const locked = () => Object.assign(new Error('busy'), { code: 'EPERM' })
describe('Windows atomic file replacement', () => {
  it('retries a transient sharing violation without changing source or destination', () => {
    const rename = vi.fn().mockImplementationOnce(() => { throw locked() }).mockImplementationOnce(() => { throw locked() }).mockReturnValue(undefined)
    const sleep = vi.fn()
    replaceFile('temporary', 'record', { platform: 'win32', rename, sleep })
    expect(rename.mock.calls).toEqual([['temporary', 'record'], ['temporary', 'record'], ['temporary', 'record']])
    expect(sleep.mock.calls).toEqual([[10], [20]])
  })
  it('bounds persistent sharing errors and propagates the original error', () => {
    const error = locked(), rename = vi.fn(() => { throw error }), sleep = vi.fn()
    expect(() => replaceFile('temporary', 'record', { platform: 'win32', rename, sleep })).toThrow(error)
    expect(rename).toHaveBeenCalledTimes(6)
    expect(sleep.mock.calls).toEqual([[10], [20], [40], [80], [160]])
  })
  it('does not retry other filesystem failures', () => {
    const rename = vi.fn(() => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }) }), sleep = vi.fn()
    expect(() => replaceFile('temporary', 'record', { platform: 'win32', rename, sleep })).toThrow('disk full')
    expect(sleep).not.toHaveBeenCalled()
  })
  it('does not apply the Windows workaround on other platforms', () => {
    const rename = vi.fn(() => { throw locked() }), sleep = vi.fn()
    expect(() => replaceFile('temporary', 'record', { platform: 'linux', rename, sleep })).toThrow('busy')
    expect(sleep).not.toHaveBeenCalled()
  })
})
