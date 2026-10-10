const skills = [
  { name: "Kotlin", featured: true },
  { name: "Java", featured: false },
  { name: "PostgreSQL", featured: true },
];

const names = skills.flatMap((skill) => (skill.featured ? [skill.name] : []));

console.log(names);
