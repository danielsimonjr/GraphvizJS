import { store } from '../platform';

const EDITOR_ZOOM_KEY = 'editorZoom';

export async function loadEditorZoom(): Promise<number | null> {
  try {
    const zoom = await store.get<number>(EDITOR_ZOOM_KEY);
    return zoom ?? null;
  } catch (error) {
    console.warn('Loading editor zoom failed', error);
    return null;
  }
}

export async function saveEditorZoom(level: number): Promise<void> {
  try {
    await store.set(EDITOR_ZOOM_KEY, level);
  } catch (error) {
    console.warn('Saving editor zoom failed', error);
  }
}
