import { defineComponents } from '@iwsdk/core';
import { Bar, Chef, Customer, Nigiri, Saku, Station } from './sushi-components.js';

/**
 * Shared component catalog, imported by both the app runtime and the editor.
 * Declare components in system-free modules and list them here.
 */
export default defineComponents([Station, Saku, Bar, Chef, Customer, Nigiri]);
