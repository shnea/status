import type { EditorDocument } from "@shnea/editor";
import type { PortfolioDocument } from "@/features/portfolio/model";

function paragraph(text: string): EditorDocument {
  return {
    format: "shnea-editor",
    version: 3,
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  };
}

// Fictional data for inspecting the implemented design; no account or uploaded files are used.
export const swissSample: PortfolioDocument = {
  template: "swiss",
  profile: {
    name: "김상태",
    title: "",
    introduction: "백엔드 개발자",
    about: paragraph(
      "Kotlin과 Spring Boot로 웹 서비스를 만듭니다. 요구사항을 정리하고, 데이터와 권한의 경계를 설계합니다.",
    ),
    imageId: null,
    bannerImageId: null,
    contacts: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        type: "email",
        label: "이메일",
        value: "portfolio@example.com",
        icon: "mail",
        visible: true,
      },
    ],
  },
  skills: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Kotlin",
      category: "언어",
      icon: { provider: "simple-icons", key: "kotlin", hex: "7F52FF", monochromeAllowed: false },
      featured: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      name: "Spring Boot",
      category: "프레임워크",
      icon: {
        provider: "simple-icons",
        key: "springboot",
        hex: "6DB33F",
        monochromeAllowed: false,
      },
      featured: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      name: "PostgreSQL",
      category: "데이터베이스",
      icon: {
        provider: "simple-icons",
        key: "postgresql",
        hex: "4169E1",
        monochromeAllowed: false,
      },
      featured: false,
    },
  ],
  projects: [
    {
      id: "00000000-0000-4000-8000-000000000005",
      title: "포트폴리오 서비스",
      role: "백엔드 개발",
      summary: "프로필과 프로젝트를 작성하고 공개하는 서비스.",
      imageId: null,
      skillIds: ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"],
      links: [],
      content: paragraph(
        "OIDC 로그인, 계정별 포트폴리오, 임시저장과 공개 버전 분리를 구현했습니다.",
      ),
      visible: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000008",
      title: "통합 인증 플랫폼",
      role: "백엔드 개발",
      summary: "여러 서비스의 로그인과 권한을 한곳에서 관리.",
      imageId: null,
      skillIds: ["00000000-0000-4000-8000-000000000003"],
      links: [
        {
          id: "00000000-0000-4000-8000-000000000010",
          type: "web",
          label: "웹사이트",
          value: "https://example.com",
          icon: "globe",
          visible: true,
        },
      ],
      content: paragraph("계정과 서비스 권한의 경계를 설계했습니다. 디자인 확인용 예시입니다."),
      visible: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000009",
      title: "기술 문서 검색",
      role: "API 설계",
      summary: "문서의 변경 사항을 색인하고 검색 결과에 반영.",
      imageId: null,
      skillIds: ["00000000-0000-4000-8000-000000000004"],
      links: [],
      content: paragraph("문서 검색 API와 색인 작업을 구현했습니다. 디자인 확인용 예시입니다."),
      visible: true,
    },
  ],
  history: [
    {
      id: "00000000-0000-4000-8000-000000000006",
      title: "서비스 개발",
      organization: "예시 스튜디오",
      role: "백엔드 개발자",
      summary: "웹 서비스의 API와 데이터베이스 설계.",
      startMonth: "2024-03",
      endMonth: "",
      ongoing: true,
      content: paragraph(
        "인증과 공개 데이터 조회를 담당했습니다. 이 내용은 디자인 확인용 예시입니다.",
      ),
      visible: true,
    },
  ],
  certifications: [
    {
      id: "00000000-0000-4000-8000-000000000007",
      name: "예시 자격",
      issuer: "예시 발급기관",
      issuedOn: "2024-06-01",
      expiresOn: "",
      credentialId: "",
      credentialIdVisible: false,
      url: "",
      visible: true,
    },
  ],
  sections: [
    { id: "projects", visible: true },
    { id: "about", visible: true },
    { id: "skills", visible: true },
    { id: "history", visible: true },
    { id: "certifications", visible: true },
  ],
};
