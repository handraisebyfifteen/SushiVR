import { defineComponents } from '@iwsdk/core';
import { Bar, CaseItem, Chef, Customer, Master, Nigiri, Station } from './sushi-components.js';

/**
 * Shared component catalog, imported by both the app runtime and the editor.
 * Declare components in system-free modules and list them here.
 */
export default defineComponents([Station, CaseItem, Bar, Chef, Customer, Nigiri, Master]);
