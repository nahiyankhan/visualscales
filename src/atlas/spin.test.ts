import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { coastRotation, trackballPoint } from './spin.js'

describe('Atlas trackball', () => {
  it('maps drag positions onto a sphere and continues beyond its bounds', () => {
    expect(trackballPoint(0, 0, 100).distanceTo(new Vector3(0, 0, 1))).toBe(0)
    expect(trackballPoint(50, 0, 100).x).toBe(0.5)
    expect(trackballPoint(0, 50, 100).y).toBe(-0.5)
    expect(trackballPoint(200, 0, 100).distanceTo(new Vector3(1, 0, 0))).toBe(0)
    expect(trackballPoint(200, 200, 100).length()).toBeCloseTo(1)
  })

  it('decays release speed consistently across frame rates', () => {
    const axis = new Vector3(0, 1, 0)
    const single = new Quaternion()
    const many = new Quaternion()
    const finalSpeed = coastRotation(single, axis, 3, 1)
    let speed = 3
    for (let i = 0; i < 60; i++)
      speed = coastRotation(many, axis, speed, 1 / 60)
    expect(speed).toBeCloseTo(finalSpeed)
    expect(single.angleTo(many)).toBeCloseTo(0)
    expect(speed).toBeLessThan(0.02)
  })
})
