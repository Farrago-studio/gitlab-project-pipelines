# Farrago GitLab Pipelines

Surveillez tous les pipelines GitLab du projet ouvert dans Visual Studio Code, sans changer de branche locale ni quitter l’éditeur.

Farrago GitLab Pipelines est développée et maintenue par [Farrago](https://farrago.fr/), agence française de développement d’applications web, mobiles et SaaS, d’automatisation et de DevOps.

> Cette extension indépendante est développée par Farrago. Elle n’est ni affiliée à GitLab Inc., ni approuvée ou sponsorisée par GitLab Inc.

## Fonctionnalités

- Détection du projet GitLab depuis le remote Git configuré.
- Compatibilité GitLab.com et instances GitLab auto-hébergées.
- Liste des pipelines récents de toutes les branches et de tous les tags.
- Distinction et filtrage entre branches et tags.
- Tableau de bord pleine largeur.
- Affichage des jobs et de leurs statuts.
- Lancement des jobs manuels après confirmation explicite.
- Consultation des logs dans le panneau de sortie VS Code.
- Liens directs vers les pipelines et jobs GitLab.
- Actualisation automatique configurable.
- Stockage du token dans le stockage sécurisé de VS Code, jamais dans les réglages du projet.
- Interface disponible en anglais et en français.

## Démarrage

1. Ouvrez un dossier contenant un dépôt Git connecté à GitLab.
2. Sélectionnez l’icône **Pipelines Farrago** dans la barre d’activité.
3. Cliquez sur la clé ou lancez **GitLab Pipelines : configurer le token d’accès**.
4. Saisissez un Personal Access Token GitLab.

Le scope `read_api` suffit pour la consultation. Utilisez `api` pour lancer les jobs manuels.

Développez un pipeline pour afficher ses jobs. Cliquez sur un job pour consulter ses logs dans VS Code, utilisez **Ouvrir dans GitLab** pour voir sa page GitLab ou le bouton de lecture pour lancer un job manuel.

## Sécurité et confidentialité

L’extension communique uniquement avec l’instance GitLab détectée ou configurée. Elle n’intègre aucune télémétrie, publicité, analyse d’usage ou serveur Farrago intermédiaire. Consultez [PRIVACY.md](PRIVACY.md) et [SECURITY.md](SECURITY.md).

## Support

Consultez [SUPPORT.md](SUPPORT.md) ou écrivez à [contact@farrago.fr](mailto:contact@farrago.fr).

---

Développé avec soin par [Farrago](https://farrago.fr/) — agence de développement d’applications sur mesure.
