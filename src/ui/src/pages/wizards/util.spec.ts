import { removeDisabledObjects } from './util';

describe('export disabled objects', () => {
  test('should remove disabled objects', () => {
    const value = {
      __disabled: ['a'],
      a: {
        ba: 'a',
      },
      b: {
        ba: 'a',
      },
    };

    const removed = removeDisabledObjects(value);

    expect(removed).toEqual({
      b: {
        ba: 'a',
      },
    });
  });
  test('should remove disabled objects from an array', () => {
    const value = {
      __disabled: ['a', 'c/0', 'c/3'],
      a: {
        ba: 'a',
      },
      b: {
        ba: 'a',
      },
      c: [
        {
          ca: 'a',
        },
        {
          cb: 'b',
        },
        {
          cc: 'c',
        },
      ],
    };

    const removed = removeDisabledObjects(value);

    expect(removed).toEqual({
      b: {
        ba: 'a',
      },
      c: [
        {
          cb: 'b',
        },
        {
          cc: 'c',
        },
      ],
    });
  });
});
