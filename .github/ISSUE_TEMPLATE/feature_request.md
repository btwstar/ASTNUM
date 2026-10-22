---
name: 💡 Feature request
about: Suggest an idea or improvement
title: "[Feature]: "
labels: enhancement
assignees: ""
body:
  - type: textarea
    id: problem
    attributes:
      label: The problem / wish
      description: What are you trying to achieve? What's missing or annoying today?
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Your proposed solution
      description: How should it work? Any design references?
  - type: dropdown
    id: area
    attributes:
      label: Area
      options:
        - Today screen
        - Habits
        - Notes & tasks
        - Workouts (gym)
        - Body & measurements
        - Nutrition
        - Statistics (Analyst)
        - Android widgets
        - Languages & translation
        - Design / theme
        - Other
    validations:
      required: true
