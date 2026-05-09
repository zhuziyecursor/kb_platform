package com.kb.ingest.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateSpaceAclRequest {

    private List<SpaceAclEntry> permissions;
}
