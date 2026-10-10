"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import styles from "./AdminConsole.module.css";

interface Review {
  items: {
    id: string;
    ownerId: string;
    ownerName: string;
    name: string;
    size: number;
    uploadedAt: string;
    unreferencedSince: string | null;
    deleteAfter: string | null;
    deleting: boolean;
    retryPending: boolean;
  }[];
  inspected: number;
  hasMore: boolean;
}

export function UnusedFilesReview() {
  const [review, setReview] = useState<Review | null>(null);
  const [failure, setFailure] = useState("");
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<Review>("/admin/files/review?page=" + page, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setReview(value);
          setFailure("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setFailure(error instanceof Error ? error.message : "첨부 목록을 불러오지 못했습니다.");
      });

    return () => controller.abort();
  }, [page, refresh]);

  return (
    <section>
      <div className={styles.sectionHeading + " " + styles.auditHeading}>
        <h3>미사용 첨부 후보</h3>
        <button
          type="button"
          className={styles.button}
          onClick={() => setRefresh((value) => value + 1)}
        >
          목록 확인
        </button>
      </div>
      <p>어디에도 참조되지 않은 상태가 7일간 유지된 파일만 자동 삭제합니다.</p>
      {failure && (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      )}
      {review && (
        <>
          <p>
            {review.inspected}개 등록 파일 검사 · {review.items.length}개 후보
          </p>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>파일</th>
                  <th>소유자</th>
                  <th>크기</th>
                  <th>등록일</th>
                  <th>삭제 예정</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {review.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.ownerName || "이름 미등록"}</td>
                    <td>
                      {(item.size / 1024).toLocaleString("ko-KR", { maximumFractionDigits: 1 })} KiB
                    </td>
                    <td>{new Date(item.uploadedAt).toLocaleDateString("ko-KR")}</td>
                    <td>
                      {item.deleteAfter
                        ? new Date(item.deleteAfter).toLocaleString("ko-KR")
                        : "참조 확인 중"}
                    </td>
                    <td>
                      {item.retryPending
                        ? "삭제 재시도 대기"
                        : item.deleting
                          ? "삭제 중"
                          : "보존 대기"}
                    </td>
                  </tr>
                ))}
                {!review.items.length && (
                  <tr>
                    <td colSpan={6}>이 범위에는 후보가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              이전 파일
            </button>
            <span>{page + 1}</span>
            <button
              type="button"
              className={styles.button}
              disabled={!review.hasMore}
              onClick={() => setPage(page + 1)}
            >
              다음 파일
            </button>
          </div>
        </>
      )}
    </section>
  );
}
