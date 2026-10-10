const text = (value) => ({ type: "paragraph", content: [{ type: "text", text: value }] });

const body = (paragraphs) => ({
  format: "shnea-editor",
  version: 3,
  content: { type: "doc", content: paragraphs.map(text) },
});

export function printFixture() {
  const projectId = "22222222-2222-4222-8222-222222222222";
  const imageId = "33333333-3333-4333-8333-333333333333";

  return {
    version: "draft",
    revision: 4,
    slug: "pdf-writer",
    publicProjectIds: [projectId],
    document: {
      template: "swiss",
      profile: {
        name: "김상태",
        introduction: "Kotlin과 Spring Boot로 서비스를 개발합니다.",
        imageId,
        about: body([
          ...Array.from(
            { length: 18 },
            (_, index) =>
              "한글이 포함된 자기소개 " +
              (index + 1) +
              ". 서비스의 요구사항을 정리하고 사용자에게 필요한 기능을 구현합니다. 긴 문장이 페이지 경계에서 자연스럽게 이어지는지 확인합니다.",
          ),
          "자기소개 마지막 문단",
        ]),
        contacts: [
          {
            id: "contact",
            type: "email",
            label: "이메일",
            value: "writer@example.test",
            icon: "mail",
            visible: true,
          },
        ],
      },
      skills: [
        { id: "kotlin", name: "Kotlin", category: "언어", featured: true },
        { id: "spring", name: "Spring Boot", category: "백엔드", featured: true },
      ],
      sections: ["skills", "projects", "history", "certifications"].map((id) => ({
        id,
        visible: true,
      })),
      projects: [
        {
          id: projectId,
          title: "상태창",
          role: "백엔드 개발",
          summary: "사용자별 작성과 공개를 분리한 포트폴리오 서비스.",
          imageId,
          skillIds: ["kotlin", "spring"],
          links: [
            {
              id: "link",
              type: "web",
              label: "GitHub",
              value: "https://github.com/shnea/status",
              visible: true,
            },
          ],
          content: body([
            ...Array.from(
              { length: 14 },
              (_, index) =>
                "프로젝트 상세 " +
                (index + 1) +
                ". 계정 권한과 데이터 소유권을 검사하고, 저장 버전과 공개 버전을 별도로 관리했습니다. 공개하지 않은 항목은 외부 조회에서 제외했습니다.",
            ),
            "프로젝트 마지막 문단",
          ]),
          visible: true,
        },
      ],
      history: [
        {
          id: "history",
          title: "서비스 개발",
          organization: "개발팀",
          role: "백엔드 개발자",
          summary: "설계부터 검수까지 서비스를 개발했습니다.",
          startMonth: "2024-01",
          endMonth: "",
          ongoing: true,
          content: body(["히스토리 마지막 문단"]),
          visible: true,
        },
      ],
      certifications: [
        {
          id: "certificate",
          name: "기술 인증",
          issuer: "발급 기관",
          issuedOn: "2025-01-01",
          expiresOn: "",
          credentialId: "",
          credentialIdVisible: false,
          url: "https://example.test/credential",
          visible: true,
        },
      ],
    },
  };
}
