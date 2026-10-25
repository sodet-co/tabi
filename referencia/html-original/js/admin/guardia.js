// Importado primero por cada pantalla del panel: si no hay sesión, redirige al login
// antes de que se pinte nada.
import { exigirSesion } from '../core/sesion.js';
exigirSesion();
