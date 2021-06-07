import { removeDisabledObjects } from './util';

describe('export disabled objects', () => {
  test('should remove disabled objects', () => {
    const value = {
      a: {
        __enabled: false,
        ba: 'a',
      },
      b: {
        __enabled: true,
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
      a: {
        __enabled: false,
        ba: 'a',
      },
      b: {
        __enabled: true,
        ba: 'a',
      },
      c: [
        {
          __enabled: false,
          ca: 'a',
        },
        {
          cb: 'b',
        },
        {
          __enabled: true,
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
