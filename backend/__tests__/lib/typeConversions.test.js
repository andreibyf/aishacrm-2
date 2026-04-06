import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toNullableString,
  toNumeric,
  toInteger,
  toBoolean,
  assignStringField,
  assignNumericField,
  assignIntegerField,
  assignBooleanField,
} from '../../lib/typeConversions.js';

describe('typeConversions', () => {
  describe('toNullableString', () => {
    it('handles undefined/null/empty values', () => {
      assert.equal(toNullableString(undefined), undefined);
      assert.equal(toNullableString(null), null);
      assert.equal(toNullableString(''), null);
      assert.equal(toNullableString('   '), null);
    });

    it('trims strings and stringifies non-strings', () => {
      assert.equal(toNullableString(' hello '), 'hello');
      assert.equal(toNullableString(123), '123');
      assert.equal(toNullableString(true), 'true');
    });
  });

  describe('toNumeric / toInteger', () => {
    it('parses valid values and handles invalid values', () => {
      assert.equal(toNumeric('1.25'), 1.25);
      assert.equal(toNumeric('abc'), null);
      assert.equal(toNumeric(''), null);

      assert.equal(toInteger('42'), 42);
      assert.equal(toInteger('42.9'), 42);
      assert.equal(toInteger('abc'), null);
      assert.equal(toInteger(null), null);
    });
  });

  describe('toBoolean', () => {
    it('handles booleans and common string values', () => {
      assert.equal(toBoolean(true), true);
      assert.equal(toBoolean(false), false);
      assert.equal(toBoolean('true'), true);
      assert.equal(toBoolean('1'), true);
      assert.equal(toBoolean('yes'), true);
      assert.equal(toBoolean('false'), false);
      assert.equal(toBoolean('0'), false);
      assert.equal(toBoolean('no'), false);
      assert.equal(toBoolean('   '), false);
      assert.equal(toBoolean(undefined), null);
      assert.equal(toBoolean(null), null);
    });
  });

  describe('assign helpers', () => {
    it('assigns only when value is not undefined and preserves null semantics', () => {
      const obj = {};

      assignStringField(obj, 'name', '  Alice  ');
      assignStringField(obj, 'nickname', '   ');
      assignStringField(obj, 'skipString', undefined);

      assignNumericField(obj, 'score', '10.5');
      assignNumericField(obj, 'scoreNull', null);
      assignNumericField(obj, 'skipNumeric', undefined);

      assignIntegerField(obj, 'count', '7.8');
      assignIntegerField(obj, 'countNull', null);
      assignIntegerField(obj, 'skipInteger', undefined);

      assignBooleanField(obj, 'active', 'yes');
      assignBooleanField(obj, 'activeNull', null);
      assignBooleanField(obj, 'skipBoolean', undefined);

      assert.deepEqual(obj, {
        name: 'Alice',
        nickname: null,
        score: 10.5,
        scoreNull: null,
        count: 7,
        countNull: null,
        active: true,
        activeNull: null,
      });
    });
  });
});
