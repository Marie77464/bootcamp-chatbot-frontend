# Study Buddy : frontend

Interface React + TypeScript (Vite) pour le backend `bootcamp-chatbot-backend`.

**Backend :** https://github.com/Marie77464/bootcamp-chatbot-backend

## Lancer en local

1. Démarrer le backend (port 8000) depuis `bootcamp-chatbot-backend` :

```bash
uv run fastapi dev main.py --port 8000
```

2. Démarrer le frontend depuis ce dossier :

```bash
npm install
npm run dev
```

3. Ouvrir http://localhost:5173.

Les appels vers `/api/*` sont redirigés vers `http://localhost:8000` par le proxy de Vite (`vite.config.ts`), en retirant le préfixe `/api`. Il n'y a donc pas besoin de configurer CORS côté backend, et le navigateur ne communique jamais directement avec l'API du LLM : la clé API reste uniquement côté backend.

## Endpoints utilisés

| Méthode | Route | Usage |
| --- | --- | --- |
| `GET` | `/conversations` | Historique des conversations (barre latérale) |
| `POST` | `/conversations` | Bouton « Nouvelle conversation » |
| `GET` | `/conversations/{id}/messages` | Messages d'une conversation |
| `POST` | `/conversations/{id}/notes` | Bouton « Ajouter une note » |
| `POST` | `/chat` | Envoi d'un message |

## Rôles de messages affichés

Chaque rôle stocké en base a un style distinct dans le chat (`App.css`, `ChatWindow.tsx`) :

| Rôle | Rendu |
| --- | --- |
| `user` / `assistant` | bulles de conversation classiques |
| `system-notification` | notification système |
| `note` | post-it jaune, bordure pointillée (note personnelle de l'étudiant, jamais envoyée au LLM) |
| `quiz` | carte verte à gauche (question de révision, toutes les 3 réponses) |
| `summary` | carte bleue centrée (résumé, toutes les 4 réponses) |

Le détail du traitement de ces rôles côté backend (filtrage ou transformation avant l'envoi au LLM) est expliqué dans le README du backend.